// Rules of the automatic store guides (see docs/superpowers/specs/2026-11-09-auto-store-guides-design.md): which
// stores get one, and the checks a written guide must pass before it is scheduled. Pure, so it is tested alone.
import type { StoreGuide } from "./store-guides.ts";

export interface GuideSettings { minLive: number; perDay: number; delayHours: number; enabled: boolean }

export const GUIDE_DEFAULTS: GuideSettings = { minLive: 5, perDay: 2, delayHours: 48, enabled: true };
// ponytail: hard ceiling so a typo in the panel can't publish dozens a day (the scaled-content risk)
const MAX_PER_DAY = 5;

const intIn = (raw: string | undefined, min: number, max: number, fallback: number) => {
  const n = Number(raw);
  return Number.isInteger(n) && n >= min ? Math.min(n, max) : fallback;
};

// The settings table keys guides_* (edited in /panel/guias)
export function settingsOf(v: Record<string, string | undefined>): GuideSettings {
  return {
    minLive: intIn(v.guides_min_live, 1, 100, GUIDE_DEFAULTS.minLive),
    perDay: intIn(v.guides_per_day, 1, MAX_PER_DAY, GUIDE_DEFAULTS.perDay),
    delayHours: intIn(v.guides_delay_hours, 0, 24 * 14, GUIDE_DEFAULTS.delayHours),
    enabled: v.guides_enabled ? v.guides_enabled === "1" : GUIDE_DEFAULTS.enabled,
  };
}

// What we know of one store on the public site. live = its live coupons, split into codes and deals (offers with no
// code); lasting* = those still valid in LASTING_DAYS (or with no end date). Search Console fields: its page, last 28 days.
export interface StoreSignals {
  storeId: number; slug: string; name: string; country: string;
  live: number; codes: number; lastingCodes: number; deals: number; lastingDeals: number; clicks30: number;
  impressions?: number; position?: number | null;
}
export type Candidate = StoreSignals & { score: number };

// A coupon that ends within this many days doesn't count as content the guide can stand on
export const LASTING_DAYS = 14;
// "YYYY-MM-DD" or "" (no end date) → still valid LASTING_DAYS from `today` (YYYY-MM-DD, Madrid)
export function lasts(expiresAt: string, today: string): boolean {
  if (!expiresAt) return true;
  const limit = new Date(`${today}T12:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + LASTING_DAYS);
  return expiresAt >= limit.toISOString().slice(0, 10);
}

// Below this many lasting coupons the page is close to empty in two weeks: no guide
const MIN_LASTING = 2;

// The guide answers «código descuento <tienda>»: codes that will still work are what the reader came for. Everything
// is capped so a big catalogue, one busy week or a famous brand can't take every slot.
export function scoreOf(s: StoreSignals): number {
  const shortCodes = Math.max(0, s.codes - s.lastingCodes);
  const impressions = s.impressions ?? 0;
  const pos = s.position ?? null;
  let score = 5 * Math.min(s.lastingCodes, 5) + 2 * Math.min(shortCodes, 3) + Math.min(s.lastingDeals, 8) + 2 * Math.min(s.clicks30, 15);
  score += Math.min(Math.round(impressions / 20), 40);
  // Google already shows the page between 8 and 30: a guide has the best odds of lifting it to the first page
  if (impressions >= 20 && pos != null && pos >= 8 && pos <= 30) score += 15;
  // shown a lot and still past 40: the result page is held by big sites, a guide is unlikely to move it
  if (impressions >= 100 && pos != null && pos > 40) score -= 20;
  return score;
}

// Stores that should get a guide, best first: Spanish (or unknown) market, enough live coupons, at least one code (the
// search is «código descuento…»), content that lasts, and no guide yet. `taken` = slugs that already have one
// (hand-written, scheduled, published or rejected).
export function pickCandidates(all: readonly StoreSignals[], opts: { minLive: number; taken: ReadonlySet<string> }): Candidate[] {
  return all
    .filter((s) => (s.country === "ES" || s.country === "") && s.live >= opts.minLive && s.codes >= 1 && s.lastingCodes + s.lastingDeals >= MIN_LASTING && !opts.taken.has(s.slug))
    .map((s) => ({ ...s, score: scoreOf(s) }))
    .sort((a, b) => b.score - a.score || b.live - a.live || a.slug.localeCompare(b.slug));
}

const textsOf = (g: StoreGuide): string[] => [
  g.lead,
  ...g.sections.flatMap((s) => [s.heading, ...s.paragraphs, ...(s.steps ?? [])]),
  ...g.faqs.flatMap((f) => [f.q, f.a]),
];

const wordsIn = (s: string): string[] => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

export const guideWords = (g: StoreGuide): number => textsOf(g).reduce((n, t) => n + wordsIn(t).length, 0);

export const MIN_WORDS = 450;
export const MAX_WORDS = 1400;
// Store policies the AI must not state unless the store's facts say so
const POLICY_RE = /env[ií]os? gratis|devoluci[oó]n(es)? gratis|\d+\s*d[ií]as (para|de) (devolver|devoluci[oó]n)/i;
const FACTS_POLICY_RE = /env[ií]o|devoluc/i;
// Something that looks like a discount code: capitals and digits, at least one of each, 4+ characters
const CODE_RE = /\b(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]{4,}\b/g;

// Why a written guide can't be scheduled ([] = it can)
export function guideProblems(g: StoreGuide, store: { facts: string; codes: readonly string[] }): string[] {
  const problems: string[] = [];
  const words = guideWords(g);
  if (words < MIN_WORDS) problems.push(`demasiado corta (${words} palabras)`);
  if (words > MAX_WORDS) problems.push(`demasiado larga (${words} palabras)`);
  if (!g.lead.toLowerCase().includes(g.keyword.toLowerCase())) problems.push("la keyword no está en la entradilla");
  const text = textsOf(g).join("\n");
  if (POLICY_RE.test(text) && !FACTS_POLICY_RE.test(store.facts)) problems.push("habla de envío o devoluciones sin datos de la tienda");
  const known = new Set(store.codes.map((c) => c.toUpperCase()));
  const invented = [...new Set(text.match(CODE_RE) ?? [])].filter((c) => !known.has(c));
  if (invented.length) problems.push(`menciona códigos que no tenemos: ${invented.join(", ")}`);
  return problems;
}

const trigrams = (g: StoreGuide): Set<string> => {
  const w = wordsIn(textsOf(g).join(" "));
  return new Set(w.slice(2).map((_, i) => `${w[i]} ${w[i + 1]} ${w[i + 2]}`));
};

// Jaccard of word trigrams: how much of two guides is the same text (0 = nothing, 1 = identical)
export function guideSimilarity(a: StoreGuide, b: StoreGuide): number {
  const x = trigrams(a);
  const y = trigrams(b);
  if (!x.size && !y.size) return 1;
  let shared = 0;
  for (const t of x) if (y.has(t)) shared++;
  return shared / (x.size + y.size - shared);
}

export const MAX_SIMILARITY = 0.45;
