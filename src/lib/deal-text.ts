// How a coupon's raw feed text reads on the public site: clean titles, reader-facing conditions, one card per deal.
// Pure, so node:test covers it.
import { badgeLabel } from "./discount.ts";
import { MONTHS } from "./site-text.ts";

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// letters, digits, % and €, single-spaced, no space before % or € ("-60 % su Fila" → "60% su fila")
const textKey = (s: string) =>
  fold(s)
    .replace(/[^\p{L}\p{N}%€]+/gu, " ")
    .replace(/\s+/g, " ")
    .replace(/ (?=[%€])/g, "")
    .trim();

// Research and editor notes that sometimes end up in a description: links, sources, doubts about the coupon
const NOTE =
  /https?:\/\/|\bwww\.|drive\.google|\bsegun (la |una )?(fuente|noticia)|\bsegun europa press|\bnoticia de\b|\ben la fuente\b|\bfuente:|\bno consta\b|\bno se indica\b|\bsin fecha de fin indicada\b|\ben el resultado\b|\bla pagina es de\b/;

// "No válido en lanzamientos. Pedido mínimo 50 €." → ["No válido en lanzamientos", "Pedido mínimo 50 €"].
// Notes for the team, and bullets the title already says, are left out.
export function conditionsOf(description: string, title = ""): string[] {
  const titleKey = ` ${textKey(title)} `;
  return description
    .split(/(?<=[.;])\s+|\n+/)
    .map((s) => s.trim().replace(/[.;]$/, ""))
    .filter((s) => s && !NOTE.test(fold(s)))
    .filter((s) => !title || !titleKey.includes(` ${textKey(s)} `));
}

// More than 70 % of the letters in capitals: a feed title written in caps
const isShouting = (s: string) => {
  const letters = s.match(/\p{L}/gu) ?? [];
  const upper = s.match(/\p{Lu}/gu) ?? [];
  return letters.length >= 5 && upper.length / letters.length > 0.7;
};

// Lowercase every word except those with digits (codes, figures), then give the store back its own spelling
function sentenceCase(s: string, storeName: string): string {
  const lower = s
    .split(" ")
    .map((w) => (/\d/.test(w) ? w : w.toLowerCase()))
    .join(" ");
  const restored = storeName ? lower.replace(new RegExp(escapeRe(storeName), "giu"), storeName) : lower;
  return capitalize(restored);
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// A feed title for display: "WORTEN: HASTA 90% | TELES" next to the store Worten → "Hasta 90% · teles".
// Caps become sentence case, a leading "<Store>:" or "<Store> -" and a trailing "| <Store>" go, pipes become " · ".
export function displayTitle(title: string, storeName: string): string {
  const raw = title.trim().replace(/\s+/g, " ");
  const store = storeName.trim();
  let t = raw;
  let cut = false;
  if (store) {
    const lead = new RegExp(`^${escapeRe(store)}(?::|\\s+[-–—])\\s*`, "iu");
    cut = lead.test(t);
    t = t.replace(lead, "").replace(new RegExp(`\\s*\\|\\s*${escapeRe(store)}$`, "iu"), "");
  }
  t = t.replace(/\s*\|\s*/g, " · ").trim();
  if (!t) return raw;
  if (isShouting(t)) return sentenceCase(t, store);
  return cut ? capitalize(t) : t;
}

type Dedupable = { id: number; store_id: number; title: string; verified: number };

// One card per store and title: the verified one wins, then the newest. Keeps the list's order.
export function dedupeDeals<T extends Dedupable>(list: T[]): T[] {
  const keyOf = (c: T) => `${c.store_id}|${textKey(c.title)}`;
  const best = new Map<string, T>();
  for (const c of list) {
    const held = best.get(keyOf(c));
    if (!held || c.verified > held.verified || (c.verified === held.verified && c.id > held.id)) best.set(keyOf(c), c);
  }
  return list.filter((c) => best.get(keyOf(c)) === c);
}

// "Válido en Pro Plan" → "válido en Pro Plan" for the middle of a sentence; "IVA incluido" stays
export function lowerFirst(s: string): string {
  if (/^\p{L}\p{Lu}/u.test(s)) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

// "Hasta 90 %" in the middle of a sentence → "hasta 90 %"; figures and "2x1" stay
export const badgeInSentence = (badge: string) => lowerFirst(badge);

// Does the title already show this badge's figure? ("20% en Hill's" and "20 %")
export function mentionsBadge(title: string, badge: string): boolean {
  const figure = /(\d+(?:[.,]\d+)?) ?([%€])/.exec(badge);
  if (!figure) return false;
  return new RegExp(`(^|[^\\d.,])${escapeRe(figure[1])} ?\\${figure[2]}`).test(title);
}

type Titled = { kind: "code" | "deal"; code: string; discount: string };

// The store page h1 and title. "Códigos descuento" only when the store has codes, and then only codes' figures:
// "Códigos descuento zooplus 15 % y 5 €, noviembre 2026" / "Ofertas PcComponentes 320 € y 50 €, noviembre 2026"
export function storeHeading(storeName: string, coupons: Titled[], now: Date): string {
  const codes = coupons.filter((c) => c.kind === "code" && c.code.trim());
  const pool = codes.length ? codes : coupons;
  const figures = pool
    .map((c) => /^(Hasta )?(\d+(?:,\d+)?) ([%€])$/.exec(badgeLabel(c.discount)))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ upTo: Boolean(m[1]), value: Number(m[2].replace(",", ".")), unit: m[3], text: `${m[1] ? "hasta " : ""}${m[2]} ${m[3]}` }))
    .sort((a, b) => (a.unit === b.unit ? 0 : a.unit === "%" ? -1 : 1) || b.value - a.value || Number(a.upTo) - Number(b.upTo));
  const seen = new Set<string>();
  const top = figures.filter((f) => !seen.has(`${f.value}${f.unit}`) && seen.add(`${f.value}${f.unit}`)).slice(0, 2);
  const head = `${codes.length ? "Códigos descuento" : "Ofertas"} ${storeName}`;
  return `${head}${top.length ? ` ${top.map((f) => f.text).join(" y ")}` : ""}, ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
}
