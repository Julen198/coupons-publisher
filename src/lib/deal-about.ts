// "Sobre este chollo": the original text per deal. The AI drafts it from the facts below, an editor approves it.
// Pure, so node:test covers it; the AI call lives in ai-content.ts.
import { factsOf } from "./catalog.ts";
import { conditionsOf, displayTitle } from "./deal-text.ts";
import { badgeLabel } from "./discount.ts";
import { longDate } from "./site-text.ts";

export type AboutStatus = "" | "draft" | "approved";

export const ABOUT_MIN = 200;
export const ABOUT_MAX = 1200;
const SNIPPET_MAX = 150;

type AboutCoupon = { title: string; kind: "code" | "deal"; code: string; discount: string; description: string; expires_at: string };
type AboutStore = { name: string; facts: string; intro: string };

// Everything the model may say, one fact per line. The code itself stays out: codes change, the text would go stale.
export function dealAboutInput(c: AboutCoupon, store: AboutStore): string {
  const conds = conditionsOf(c.description, c.title);
  const facts = factsOf(store.facts);
  return [
    `Tienda: ${store.name}`,
    `Título: ${displayTitle(c.title, store.name)}`,
    `Descuento: ${badgeLabel(c.discount) || "sin cifra"}`,
    `Hace falta código: ${c.kind === "code" && c.code ? "sí" : "no"}`,
    `Condiciones: ${conds.length ? conds.join("; ") : "ninguna indicada"}`,
    `Válido hasta: ${c.expires_at ? longDate(c.expires_at) : "sin fecha de caducidad anunciada"}`,
    ...(facts.length ? ["Datos de la tienda:", ...facts.map((f) => `- ${f.label}: ${f.value}`)] : []),
    ...(store.intro.trim() ? [`Sobre la tienda: ${store.intro.trim()}`] : []),
  ].join("\n");
}

// The editor's text as saved: plain LF, at most one blank line between paragraphs, 200 to 1200 chars
export function cleanAbout(raw: string): string | null {
  const text = raw.replace(/\r\n?/g, "\n").trim().replace(/\n{3,}/g, "\n\n");
  return text.length >= ABOUT_MIN && text.length <= ABOUT_MAX ? text : null;
}

export const aboutParagraphs = (text: string): string[] =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);

// The start of the text for the meta description, cut at a word
export function aboutSnippet(text: string, max = SNIPPET_MAX): string {
  const flat = aboutParagraphs(text).join(" ");
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${(at > 0 ? cut.slice(0, at) : cut).replace(/[\s,.;]+$/, "")}…`;
}

// The model's paragraphs as one text, without the em dashes it tends to slip in
export const tidyDraft = (paragraphs: string[]): string =>
  paragraphs
    .map((p) => p.replace(/\s*—\s*/g, ", ").trim())
    .filter(Boolean)
    .join("\n\n");

// Which live deals get a draft next: those without a text yet, most voted first, then the newest
export function pickAboutCandidates<T extends { id: number; score: number; about_status: AboutStatus }>(rows: readonly T[], n: number): T[] {
  return rows
    .filter((r) => r.about_status === "")
    .sort((a, b) => b.score - a.score || b.id - a.id)
    .slice(0, n);
}
