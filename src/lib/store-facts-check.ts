// The store facts checker, pure part (the cron and the database are in store-facts-cron.ts). Each key fact of a store
// (envío, devoluciones…) can say where it was copied from: one "Etiqueta | URL" per line in stores.facts_sources. The
// cron reads those pages, keeps only the sentences about that policy (with a figure or a payment brand in them), and
// compares them with what it read last time. A change is never applied on its own: it waits in the panel until an
// editor checks it against the facts and marks it reviewed.
import { createHash } from "node:crypto";
import { factsOf } from "./catalog.ts";

// What a sentence must mention to belong to each fact (lower case, accents kept and dropped)
const TOPICS: { prefix: string; words: RegExp }[] = [
  { prefix: "envío", words: /env[ií]o|entrega|gastos de env|portes|shipping|delivery/ },
  { prefix: "devoluciones", words: /devoluci|devolver|desistimiento|reembols|cambios? de|return/ },
  { prefix: "códigos por pedido", words: /c[oó]digos?|cup[oó]n|cupones|promoci[oó]n|acumulable|combinable|voucher|promo code/ },
  { prefix: "formas de pago", words: /pago|pagar|tarjeta|paypal|bizum|klarna|apple pay|google pay|visa|mastercard|financiaci|aplazad|transferencia|contra ?reembolso/ },
];
// A policy sentence states something: a number (€, días, 1 código) or a payment method by name
const FIGURE = /\d|paypal|bizum|klarna|apple pay|google pay|visa|mastercard|american express|amex|contra ?reembolso|transferencia|gratis|gratuit|solo un|un solo|único|no acumulable|no son acumulables|\b(un|una|1) (solo |sola |único |única )?(c[oó]digo|cup[oó]n|promoci[oó]n|descuento|oferta)/;

export const MAX_SENTENCES = 40;
const MAX_SENTENCE = 320;

// One source per URL, with the fact labels it backs ("Envío | https://…" lines; a line without a valid http(s) URL is skipped)
export function factSources(text: string): { url: string; labels: string[] }[] {
  const byUrl = new Map<string, string[]>();
  for (const { label, value } of factsOf(text)) {
    if (!URL.canParse(value) || !/^https?:$/.test(new URL(value).protocol)) continue;
    const url = new URL(value).href;
    byUrl.set(url, [...(byUrl.get(url) ?? []), label]);
  }
  return [...byUrl].map(([url, labels]) => ({ url, labels }));
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", euro: "€", iacute: "í", aacute: "á", eacute: "é", oacute: "ó", uacute: "ú", ntilde: "ñ", Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Ntilde: "Ñ", uuml: "ü", ordm: "º", ordf: "ª" };

// The visible text of an HTML page: scripts, styles and tags out, entities decoded, one block per line
export function pageText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/td|\/th|\/dd|\/dt|\/section|\/article)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name] ?? m)
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

const topicsFor = (labels: readonly string[]) => {
  const wanted = TOPICS.filter((t) => labels.some((l) => l.toLowerCase().startsWith(t.prefix)));
  return wanted.length ? wanted : TOPICS; // a label we don't know: any policy sentence counts
};

// The sentences of a page that state the policy behind these labels, in page order, without repeats
export function policySentences(html: string, labels: readonly string[]): string[] {
  const topics = topicsFor(labels);
  const seen = new Set<string>();
  const out: string[] = [];
  const lines = pageText(html).split("\n");
  for (const [i, line] of lines.entries()) {
    // a sentence belongs to a fact when it, its paragraph or the heading just above names the topic
    const prev = lines[i - 1] ?? "";
    const heading = prev.length <= 80 && !/[.\d€]/.test(prev) ? prev : ""; // a short line without figures: a title
    const inTopic = (text: string) => topics.some((t) => t.words.test(text));
    const paragraphInTopic = line.length <= 4 * MAX_SENTENCE && inTopic(`${heading}\n${line}`.toLowerCase());
    for (const raw of line.split(/(?<=[.!?;])\s+(?=[A-ZÁÉÍÓÚÑ¿¡0-9])/)) {
      const s = raw.trim();
      const low = s.toLowerCase();
      if (s.length < 12 || s.length > MAX_SENTENCE) continue;
      if (!FIGURE.test(low) || !(inTopic(low) || paragraphInTopic)) continue;
      const key = low.replace(/[^\p{L}\p{N}€%]+/gu, " ").trim();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
      if (out.length >= MAX_SENTENCES) return out;
    }
  }
  return out;
}

// Same sentences → same digest, whatever the spacing, case or punctuation around them
export function digestOf(sentences: readonly string[]): string {
  const norm = sentences.map((s) => s.toLowerCase().replace(/[^\p{L}\p{N}€%]+/gu, " ").trim()).sort();
  return createHash("sha256").update(norm.join("\n")).digest("hex").slice(0, 32);
}

// A page that answered but is a bot wall, not the store's text
const BOT_WALL = /captcha|are you a robot|eres un robot|access denied|acceso denegado|request blocked|attention required|just a moment|checking your browser|pardon our interruption|verify you are human|px-captcha|datadome|incapsula|akamai bot/i;

export type FetchOutcome =
  | { kind: "ok"; sentences: string[]; digest: string }
  | { kind: "blocked"; detail: string } // anti-bot or refused: this page can't be checked from our server
  | { kind: "empty"; detail: string } // read, but no policy sentence (built by JavaScript, or moved)
  | { kind: "error"; detail: string }; // network, timeout, 404…

export function readOutcome(status: number, html: string, labels: readonly string[]): FetchOutcome {
  if (status === 401 || status === 403 || status === 429 || status === 503) return { kind: "blocked", detail: `La web respondió HTTP ${status}` };
  if (status >= 400) return { kind: "error", detail: `La web respondió HTTP ${status}` };
  const sentences = policySentences(html, labels);
  if (!sentences.length && BOT_WALL.test(html.slice(0, 200_000))) return { kind: "blocked", detail: "La web pide un captcha o bloquea a los robots" };
  if (!sentences.length) return { kind: "empty", detail: "La página no tiene texto sobre esta política (puede que se cargue con JavaScript o que haya cambiado de dirección)" };
  return { kind: "ok", sentences, digest: digestOf(sentences) };
}

// Failures in a row before a page is reported as not checkable (one bad day is not news)
export const FAILS_TO_REPORT = 3;

export type CheckStatus = "pending" | "ok" | "changed" | "unreadable";
export interface CheckState { status: CheckStatus; digest: string; sentences: string[]; previous: string[]; fails: number; detail: string }
export interface CheckStep { next: CheckState; news: "changed" | "unreadable" | null }

// What a new read does to a source's state. The first good read is the baseline; a later different one becomes
// "changed" (keeping what it said before) until an editor marks it reviewed; failures only count after a few in a row.
export function nextCheck(prev: CheckState | null, out: FetchOutcome): CheckStep {
  const base: CheckState = prev ?? { status: "pending", digest: "", sentences: [], previous: [], fails: 0, detail: "" };
  if (out.kind !== "ok") {
    const fails = base.fails + 1;
    const report = fails >= FAILS_TO_REPORT;
    const status: CheckStatus = base.status === "changed" ? "changed" : report ? "unreadable" : base.status;
    return { next: { ...base, fails, detail: out.detail, status }, news: report && base.status !== "unreadable" && status === "unreadable" ? "unreadable" : null };
  }
  if (!base.digest) return { next: { status: "ok", digest: out.digest, sentences: out.sentences, previous: [], fails: 0, detail: "" }, news: null };
  if (out.digest === base.digest) return { next: { ...base, status: base.status === "unreadable" || base.status === "pending" ? "ok" : base.status, fails: 0, detail: "" }, news: null };
  // changed again while waiting for review: keep the text from before the first change
  const previous = base.status === "changed" ? base.previous : base.sentences;
  return { next: { status: "changed", digest: out.digest, sentences: out.sentences, previous, fails: 0, detail: "" }, news: "changed" };
}

// The sentences that appeared and the ones that went away, for the panel and the Telegram notice
export function sentenceDiff(before: readonly string[], after: readonly string[]): { added: string[]; removed: string[] } {
  const key = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}€%]+/gu, " ").trim();
  const b = new Set(before.map(key));
  const a = new Set(after.map(key));
  return { added: after.filter((s) => !b.has(key(s))), removed: before.filter((s) => !a.has(key(s))) };
}
