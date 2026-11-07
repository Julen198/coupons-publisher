// Coupons whose title or conditions arrive from a network in another language are shown in Spanish, translated by AI
// (coupons.title_es / description_es). Pure, so node:test covers it; the AI call lives in translate-ai.ts and the
// DB run in translate-run.ts.
import { createHash } from "node:crypto";

export type TranslationStatus = "" | "auto" | "approved" | "skip";
export const TRANSLATION_STATUSES: readonly TranslationStatus[] = ["", "auto", "approved", "skip"];

export type Lang = "en" | "fr" | "de" | "it" | "pt";
export const LANG_NAMES: Record<Lang, string> = { en: "inglés", fr: "francés", de: "alemán", it: "italiano", pt: "portugués" };

// Words (accents folded) that only, or mostly, show up in coupon texts of one language. Words shared by Spanish and
// another language ("para", "clientes", "pedido", "oferta", "de") count for Spanish only or for nobody.
const words = (s: string) => new Set(s.split(/\s+/).filter(Boolean));
const ES = words(`
  del los las el para con sin por y en la al un una es tu tus su sus mas hasta desde envio envios gratis gratuito gratuita
  compra compras pedido pedidos minimo descuento descuentos codigo cupon cupones oferta ofertas rebajas rebaja rebajados todo toda
  todos todas nuevos nuevo nueva nuevas cliente clientes primer primera solo valido valida productos producto seleccionados
  seleccionadas articulos regalo ahorra consigue gastos precio precios dias ahora coleccion temporada hombre mujer ninos aplicable
  segunda unidad cualquier superior socios registrate suscribete descubre aprovecha venta zapatillas moda teles portatiles hogar
  tienda acumulable combinable incluye ya cada
`);
const OTHER: Record<Lang, Set<string>> = {
  en: words(`
    off free shipping delivery customers customer the and for your you all orders order over sale save get up best sellers now only
    items item selected extra first spend when with on of to deals deal sitewide discount purchase excludes exclusive online new
    cannot combined other offers offer full price applies apply valid until code use shop just members sign plus selected any
    when this back gift buy
  `),
  fr: words(`
    livraison gratuite offerte offert sur les des le du et pour avec votre vos commande commandes achat remise reduction soldes
    nouveaux sans jusqu au aux une est tout toute tous frais port boutique ligne valable hors articles premiere
  `),
  de: words(`
    versand kostenlos kostenloser versandkostenfrei auf und der die das fur mit ab bestellung bestellwert neukunden rabatt alles sie
    ihre jetzt bis zu sparen gutschein nur artikel bei vom im ausgewahlte gultig einkauf
  `),
  it: words(`
    spedizione gratuite per il gli della delle dei sconto ordine ordini nuovi clienti tutto tutti tutta sul sulla fino acquisto
    codice offerta saldi di alla valido prima sui
  `),
  pt: words(`
    frete em na com sua seu voce desconto novos ate ou loja cupom primeira produtos nao acima
  `),
};

const LANGS = Object.keys(OTHER) as Lang[];
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

function scores(text: string): { es: number; other: Record<Lang, number> } {
  // words with digits are codes or models (SAVE10, S25): no language
  const tokens = (fold(text).match(/[\p{L}\p{N}]+/gu) ?? []).filter((t) => !/\d/.test(t));
  const hits = (set: Set<string>) => tokens.filter((t) => t.length >= 2 && set.has(t)).length;
  const lower = text.toLowerCase();
  return {
    es: hits(ES) + 2 * count(lower, /[ñ¿¡]/g) + count(lower, /[áíóú]/g) / 2, // Portuguese has them too
    other: {
      en: hits(OTHER.en),
      fr: hits(OTHER.fr) + count(lower, /[èêàçœû]/g),
      de: hits(OTHER.de) + count(lower, /[äöüß]/g),
      it: hits(OTHER.it) + count(lower, /[àèìòù]/g),
      pt: hits(OTHER.pt) + 2 * count(lower, /[ãõ]/g) + count(lower, /[ç]/g),
    },
  };
}

function best(other: Record<Lang, number>): { lang: Lang; score: number } {
  return LANGS.reduce((a, l) => (other[l] > a.score ? { lang: l, score: other[l] } : a), { lang: "en" as Lang, score: 0 });
}

// 'other' only when another language clearly wins; a tie stays Spanish, and text with no word of any language
// (figures, codes, brand names) is 'unknown': neither is ever translated
export function detectLang(text: string): "es" | "other" | "unknown" {
  const s = scores(text);
  const o = best(s.other).score;
  if (s.es === 0 && o === 0) return "unknown";
  return o > s.es ? "other" : "es";
}

// The language a text reads as when detectLang says 'other', else ""
export function sourceLanguage(text: string): Lang | "" {
  const s = scores(text);
  const o = best(s.other);
  return o.score > s.es ? o.lang : "";
}

export function originalLabel(title: string, description: string): string {
  const lang = sourceLanguage(`${title}\n${description}`);
  return lang ? `Original (${LANG_NAMES[lang]})` : "Original";
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The title or the conditions read as another language once the store's own name is left out ("The North Face")
export function needsTranslation(c: { title: string; description: string }, storeName = ""): boolean {
  const name = storeName.trim();
  const strip = (s: string) => (name ? s.replace(new RegExp(escapeRe(name), "giu"), " ") : s);
  return detectLang(strip(c.title)) === "other" || detectLang(strip(c.description)) === "other";
}

// What the translation was made from: a changed title or description no longer matches, so it is translated again.
// Same value as SQL md5(title || E'\n' || description).
export const sourceHash = (title: string, description: string): string =>
  createHash("md5").update(`${title}\n${description}`, "utf8").digest("hex");

export type TranslatableRow = {
  title: string;
  description: string;
  title_es?: string;
  description_es?: string;
  translation_status?: string;
  translated_from?: string;
};

// What readers see: the Spanish text while it is the translation of the current source and nobody chose "No traducir"
export function publicText(c: TranslatableRow): { title: string; description: string } {
  const live =
    (c.translation_status === "auto" || c.translation_status === "approved") &&
    !!c.title_es?.trim() &&
    c.translated_from === sourceHash(c.title, c.description);
  return live ? { title: c.title_es!, description: c.description_es ?? "" } : { title: c.title, description: c.description };
}

// ---- the AI call's input and the checks on its output

export type TranslationSource = { id: number; title: string; description: string; code: string };
export type CheckResult = { ok: true; title_es: string; description_es: string } | { ok: false; reason: string };

export const TITLE_MAX = 300;
export const DESCRIPTION_MAX = 2000;
export const TRANSLATE_BATCH = 20;

export const TRANSLATION_SYSTEM = [
  "Traduces al español de España los títulos y las condiciones de cupones de descuento que llegan de redes de afiliación en otros idiomas.",
  "Reglas:",
  "- Español natural de España, como lo escribiría una web de cupones española. Mayúscula solo al principio de la frase y en nombres propios.",
  "- Mantén exactamente los nombres de marcas, tiendas y productos, las cifras, los símbolos % € $ £, las tallas, las fechas y los códigos (por ejemplo SAVE10).",
  "- No cambies ninguna cifra ni añadas cifras nuevas. Solo puedes cambiar el separador decimal (19.99 pasa a 19,99).",
  "- Traduce con fidelidad. No añadas condiciones, ventajas ni promesas que no estén en el original, y no quites ninguna.",
  "- No uses rayas (—) ni dos puntos en mitad de una frase.",
  "- Si un texto ya está en español, devuélvelo igual. Si la descripción está vacía, devuélvela vacía.",
  "- Devuelve un elemento por cada id recibido, con el mismo id.",
].join("\n");

export const translationInput = (items: readonly TranslationSource[]): string =>
  JSON.stringify(items.map(({ id, title, description }) => ({ id, title, description })));

const ORDINAL = /\d+(?:st|nd|rd|th|er|e|ème|º|ª)\b/giu;
const numbersOf = (s: string, skipOrdinals: boolean): Set<string> =>
  new Set(((skipOrdinals ? s.replace(ORDINAL, " ") : s).match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/[.,]/g, "")));
const CODE = /\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{3,}\b/g;
const SYMBOLS = ["%", "€", "$", "£"];

// The model's text, checked against the source: every figure, symbol and code is still there, no new figures,
// both fields present when the source has them. Em dashes become commas.
export function checkTranslation(src: TranslationSource, out: { title_es: string; description_es: string }): CheckResult {
  const tidy = (s: string) => s.replace(/\s*—\s*/g, ", ").replace(/\s+/g, " ").trim();
  const title_es = tidy(out.title_es ?? "");
  const description_es = tidy(out.description_es ?? "");
  if (!title_es) return { ok: false, reason: "título vacío" };
  if (title_es.length > TITLE_MAX) return { ok: false, reason: "título demasiado largo" };
  if (src.description.trim() && !description_es) return { ok: false, reason: "condiciones vacías" };
  if (!src.description.trim() && description_es) return { ok: false, reason: "condiciones añadidas" };
  if (description_es.length > DESCRIPTION_MAX) return { ok: false, reason: "condiciones demasiado largas" };

  const source = `${src.title}\n${src.description}`;
  const result = `${title_es}\n${description_es}`;
  const required = numbersOf(source, true);
  const allowed = numbersOf(source, false);
  const got = numbersOf(result, false);
  const lost = [...required].find((n) => !got.has(n));
  if (lost) return { ok: false, reason: `falta la cifra ${lost}` };
  const added = [...got].find((n) => !allowed.has(n));
  if (added) return { ok: false, reason: `cifra nueva ${added}` };
  const symbol = SYMBOLS.find((s) => source.includes(s) && !result.includes(s));
  if (symbol) return { ok: false, reason: `falta el símbolo ${symbol}` };
  const codes = new Set([...(source.match(CODE) ?? []), ...(src.code && source.includes(src.code) ? [src.code] : [])]);
  const code = [...codes].find((c) => !result.includes(c));
  if (code) return { ok: false, reason: `falta el código ${code}` };
  return { ok: true, title_es, description_es };
}

// ---- cost estimate for the dry run (the real cost is logged per call in Costes de IA)

// ~3.5 characters per token; JSON keys and ids per item; the system prompt once per batch of TRANSLATE_BATCH
export function estimateTokens(items: readonly { title: string; description: string }[]): { input: number; output: number } {
  const chars = items.reduce((a, c) => a + c.title.length + c.description.length, 0);
  const batches = Math.ceil(items.length / TRANSLATE_BATCH);
  return {
    input: Math.round(chars / 3.5 + items.length * 20 + batches * 700),
    output: Math.round((chars * 1.15) / 3.5 + items.length * 25),
  };
}

// USD per input token, output tokens priced at 5x (Anthropic's ratio for Haiku), from what earlier calls cost
export const DEFAULT_INPUT_PRICE = 1 / 1_000_000; // $1 per million input tokens, $5 output, if there is no history

export function inputPriceFrom(history: { cost: number; input: number; output: number }): number {
  const weighted = history.input + 5 * history.output;
  return history.cost > 0 && weighted > 0 ? history.cost / weighted : DEFAULT_INPUT_PRICE;
}

export const estimateCost = (t: { input: number; output: number }, inputPrice: number): number => (t.input + 5 * t.output) * inputPrice;

// ---- scripts/translate-coupons.ts arguments

export type TranslateArgs = { apply: boolean; limit: number; only: number[] | undefined };
export const DEFAULT_SCRIPT_LIMIT = 100;

export function parseTranslateArgs(argv: readonly string[]): TranslateArgs {
  let apply = false;
  let limit = DEFAULT_SCRIPT_LIMIT;
  let only: number[] | undefined;
  for (const a of argv) {
    if (a === "--apply") apply = true;
    else if (a.startsWith("--limit=")) {
      limit = Number(a.slice(8));
      if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit debe ser un número entero mayor que 0");
    } else if (a.startsWith("--only=")) {
      only = a.slice(7).split(",").map((s) => Number(s.trim()));
      if (!only.length || only.some((n) => !Number.isInteger(n) || n < 1)) throw new Error("--only lleva ids de cupón separados por comas (--only=12,34)");
    } else throw new Error(`Opción desconocida: ${a}`);
  }
  return { apply, limit, only };
}
