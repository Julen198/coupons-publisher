// Finds live coupons of Spanish-site stores whose title or conditions read as another language and translates them
// (translate-ai.ts), saving them as 'auto' (public right away). Takes its own postgres client so the panel (after a
// network sync) and scripts/translate-coupons.ts share it. Coupons that need nothing are marked as checked
// (translated_from = their source hash) so they are not looked at again until their text changes.
import type postgres from "postgres";
import { limitsFrom, madridDay } from "./ai-costs.ts";
import { countrySql, withCountryColumn } from "./country-column.ts";
import { onSpanishSite } from "./market.ts";
import { isMissingSchema } from "./schema-guard.ts";
import { estimateCost, estimateTokens, inputPriceFrom, needsTranslation, sourceHash, sourceLanguage, TRANSLATE_BATCH, type Lang } from "./translation.ts";
import { NO_USAGE, translateBatch, type BatchResult } from "./translate-ai.ts";

export type Candidate = { id: number; store_name: string; title: string; description: string; code: string; lang: Lang | ""; hash: string };

export type RunOptions = {
  apply: boolean; // false = dry run: reads only
  limit: number; // coupons sent to the AI at most
  only?: number[]; // these coupon ids, even if already checked
  userName: string; // who ran it, for Costes de IA
  timeBudgetMs?: number; // stop starting new batches after this long
  translate?: (items: Candidate[]) => Promise<BatchResult>; // tests
  now?: () => number;
};

export type RunReport = {
  pending: Candidate[]; // what goes (or would go) to the AI, at most `limit`
  waiting: number; // coupons in another language beyond the limit
  checked: number; // Spanish or language-less coupons marked as needing nothing
  translated: number;
  rejected: { id: number; reason: string }[]; // shown in their original language until their text changes
  cost: number; // USD, logged in Costes de IA
  estimate: { input: number; output: number; cost: number };
  stopped: "" | "budget" | "time" | "error";
  error?: string;
};

type Row = {
  id: number; title: string; description: string; code: string; store_name: string; store_slug: string;
  store_website: string; store_tracking_url: string; store_country: string;
};

export const MISSING_COLUMNS = "Faltan las columnas de traducción: ejecuta antes npm run db:setup";

async function loadRows(db: postgres.Sql, only: number[] | undefined): Promise<Row[]> {
  const today = madridDay(new Date());
  return withCountryColumn((cc) => db<Row[]>`
    SELECT c.id, c.title, c.description, c.code, s.name AS store_name, s.slug AS store_slug, s.website AS store_website,
           s.tracking_url AS store_tracking_url, ${db.unsafe(countrySql(cc, "s"))}
    FROM coupons c JOIN stores s ON s.id = c.store_id
    WHERE c.archived = 0 AND c.review = '' AND c.translation_status <> 'skip' AND (c.expires_at = '' OR c.expires_at >= ${today})
      ${only ? db`AND c.id = ANY(${only}::int[])` : db`AND c.translated_from <> md5(c.title || chr(10) || c.description)`}
    ORDER BY c.id DESC LIMIT 5000`);
}

// Same rule as assertWithinBudget (ai-budget.ts), on this client
async function overBudget(db: postgres.Sql): Promise<boolean> {
  const rows = await db<{ key: string; value: string }[]>`SELECT key, value FROM settings WHERE key = 'ai_budget'`;
  const { budget } = limitsFrom(Object.fromEntries(rows.map((r) => [r.key, r.value])));
  const [row] = await db<{ total: number }[]>`
    SELECT coalesce(sum(cost_total), 0)::float AS total FROM ai_usage
    WHERE at >= date_trunc('month', now() AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'Europe/Madrid'`;
  return row.total >= budget;
}

// What earlier Haiku calls without web search cost, to price the estimate
async function inputPrice(db: postgres.Sql): Promise<number> {
  const [h] = await db<{ cost: number; input: number; output: number }[]>`
    SELECT coalesce(sum(cost_total), 0)::float AS cost, coalesce(sum(input_tokens), 0)::float AS input, coalesce(sum(output_tokens), 0)::float AS output
    FROM ai_usage WHERE ok AND web_searches = 0 AND feature IN ('content', 'stores', 'style', 'translate')`;
  return inputPriceFrom(h);
}

async function record(db: postgres.Sql, userName: string, n: number, u: BatchResult["usage"], ok: boolean) {
  try {
    await db`
      INSERT INTO ai_usage (feature, about, user_name, input_tokens, output_tokens, web_searches, cost_total, cost_gateway, ok)
      VALUES ('translate', ${`Traducción de ${n} cupón${n === 1 ? "" : "es"}`}, ${userName}, ${u.input}, ${u.output}, ${u.searches}, ${u.cost}, ${u.gatewayCost}, ${ok})`;
  } catch (e) {
    console.error("AI usage not recorded", "translate", e); // never block the feature because of bookkeeping
  }
}

// Checked, nothing to show: no Spanish text, and not looked at again until the source changes
async function markChecked(db: postgres.Sql, items: { id: number; hash: string }[]) {
  if (!items.length) return;
  await db`
    UPDATE coupons c SET translated_from = v.h, title_es = '', description_es = '', translation_status = ''
    FROM (SELECT unnest(${items.map((i) => i.id)}::int[]) AS id, unnest(${items.map((i) => i.hash)}::text[]) AS h) v
    WHERE c.id = v.id AND md5(c.title || chr(10) || c.description) = v.h AND c.translation_status <> 'skip'`;
}

// Only if the source is still the one translated and nobody chose "No traducir" meanwhile
async function saveTranslations(db: postgres.Sql, rows: { id: number; hash: string; title_es: string; description_es: string }[]) {
  if (!rows.length) return;
  await db`
    UPDATE coupons c SET title_es = v.t, description_es = v.d, translation_status = 'auto', translated_from = v.h
    FROM (SELECT unnest(${rows.map((r) => r.id)}::int[]) AS id, unnest(${rows.map((r) => r.title_es)}::text[]) AS t,
                 unnest(${rows.map((r) => r.description_es)}::text[]) AS d, unnest(${rows.map((r) => r.hash)}::text[]) AS h) v
    WHERE c.id = v.id AND md5(c.title || chr(10) || c.description) = v.h AND c.translation_status <> 'skip'`;
}

function classify(rows: Row[]) {
  const spanishSite = rows.filter((r) =>
    onSpanishSite({ name: r.store_name, slug: r.store_slug, website: r.store_website, tracking_url: r.store_tracking_url, country: r.store_country }));
  const foreign: Candidate[] = [];
  const fine: { id: number; hash: string }[] = [];
  for (const r of spanishSite) {
    const hash = sourceHash(r.title, r.description);
    if (needsTranslation(r, r.store_name)) {
      foreign.push({ id: r.id, store_name: r.store_name, title: r.title, description: r.description, code: r.code, lang: sourceLanguage(`${r.title}\n${r.description}`), hash });
    } else fine.push({ id: r.id, hash });
  }
  return { foreign, fine };
}

export async function runTranslations(db: postgres.Sql, opts: RunOptions): Promise<RunReport> {
  const now = opts.now ?? Date.now;
  const startedAt = now();
  const translate = opts.translate ?? translateBatch;
  const report: RunReport = { pending: [], waiting: 0, checked: 0, translated: 0, rejected: [], cost: 0, estimate: { input: 0, output: 0, cost: 0 }, stopped: "" };
  let rows: Row[];
  try {
    rows = await loadRows(db, opts.only);
  } catch (e) {
    if (!isMissingSchema(e)) throw e;
    return { ...report, stopped: "error", error: MISSING_COLUMNS };
  }
  const { foreign, fine } = classify(rows);
  const pending = foreign.slice(0, Math.max(0, opts.limit));
  const tokens = estimateTokens(pending);
  const base = { ...report, pending, waiting: foreign.length - pending.length, estimate: { ...tokens, cost: estimateCost(tokens, await inputPrice(db)) } };
  if (!opts.apply) return base;

  await markChecked(db, fine);
  let translated = 0;
  let cost = 0;
  const rejected: RunReport["rejected"] = [];
  const done = (stopped: RunReport["stopped"], error?: string): RunReport =>
    ({ ...base, checked: fine.length, translated, rejected, cost, stopped, ...(error && { error }) });

  for (let i = 0; i < pending.length; i += TRANSLATE_BATCH) {
    if (opts.timeBudgetMs !== undefined && now() - startedAt >= opts.timeBudgetMs) return done("time");
    if (await overBudget(db)) return done("budget", "Presupuesto de IA del mes superado (Costes de IA): no se traduce más");
    const batch = pending.slice(i, i + TRANSLATE_BATCH);
    let result: BatchResult;
    try {
      result = await translate(batch);
    } catch (e) {
      await record(db, opts.userName, batch.length, NO_USAGE, false);
      return done("error", e instanceof Error ? e.message : String(e));
    }
    await record(db, opts.userName, batch.length, result.usage, true);
    cost += result.usage.cost;
    const hashOf = new Map(batch.map((c) => [c.id, c.hash]));
    await saveTranslations(db, result.translated.map((t) => ({ ...t, hash: hashOf.get(t.id) ?? "" })));
    await markChecked(db, result.rejected.map((r) => ({ id: r.id, hash: hashOf.get(r.id) ?? "" })));
    translated += result.translated.length;
    rejected.push(...result.rejected);
  }
  return done("");
}
