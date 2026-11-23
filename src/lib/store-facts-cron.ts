// The store facts checker, end to end (pure rules in store-facts-check.ts). Daily cron: read every page a store fact
// was copied from, compare it with the last read, and tell the admin chat what changed or can no longer be read.
// Nothing is rewritten on its own: the editor checks the change in /panel/guias and fixes the facts by hand.
import { sql } from "./db";
import { fetchPublic } from "./og-image-fetch";
import { siteUrl } from "./site-text";
import { tg, telegramConfig } from "./telegram";
import { isMissingSchema } from "./schema-guard.ts";
import { factSources, nextCheck, readOutcome, sentenceDiff, type CheckState, type CheckStatus, type FetchOutcome } from "./store-facts-check.ts";

const PAGE = { accept: /html|text\/plain/i, label: "html", maxBytes: 2 * 1024 * 1024, truncate: true, anyStatus: true, timeoutMs: 15_000 };
// A browser's headers: the stores' help pages are public, but some shops answer bare clients with a bot wall
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};
const PARALLEL = 4;

export interface FactCheckRow {
  store_id: number; slug: string; name: string; url: string; labels: string[]; status: CheckStatus;
  sentences: string[]; previous: string[]; fails: number; detail: string; checked_at: Date | null; changed_at: Date | null;
}

async function readSource(url: string, labels: string[]): Promise<FetchOutcome> {
  try {
    const page = await fetchPublic(url, { ...PAGE, headers: HEADERS });
    return readOutcome(page.status, page.body.toString("utf8"), labels);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { kind: "error", detail: /abort|timeout/i.test(msg) ? "La web no respondió a tiempo" : `No se pudo leer: ${msg}` };
  }
}

async function inBatches<T>(items: T[], n: number, run: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += n) await Promise.all(items.slice(i, i + n).map(run));
}

export interface FactsCronResult { checked: number; changed: string[]; unreadable: string[]; skipped?: string }

export async function runStoreFactsCron(): Promise<FactsCronResult> {
  let stores: { id: number; name: string; facts_sources: string }[];
  try {
    stores = await sql()<{ id: number; name: string; facts_sources: string }[]>`SELECT id, name, facts_sources FROM stores WHERE facts_sources <> ''`;
  } catch (e) {
    if (isMissingSchema(e)) return { checked: 0, changed: [], unreadable: [], skipped: "Falta la migración: ejecuta npm run db:setup" };
    throw e;
  }
  const result: FactsCronResult = { checked: 0, changed: [], unreadable: [] };
  const jobs = stores.flatMap((s) => factSources(s.facts_sources).map((src) => ({ store: s, ...src })));
  // pages no longer listed as a source stop being checked
  const keep = jobs.map((j) => `${j.store.id} ${j.url}`);
  await sql()`DELETE FROM store_fact_checks WHERE NOT (store_id::text || ' ' || url = ANY(${keep}))`;
  const notices: string[] = [];
  await inBatches(jobs, PARALLEL, async (job) => {
    const [prev] = await sql()<CheckState[]>`
      SELECT status, digest, sentences, previous, fails, detail FROM store_fact_checks WHERE store_id = ${job.store.id} AND url = ${job.url}`;
    const out = await readSource(job.url, job.labels);
    const { next, news } = nextCheck(prev ?? null, out);
    await sql()`
      INSERT INTO store_fact_checks (store_id, url, labels, status, digest, sentences, previous, fails, detail, checked_at, changed_at)
      VALUES (${job.store.id}, ${job.url}, ${job.labels}, ${next.status}, ${next.digest}, ${sql().json(next.sentences as never)}, ${sql().json(next.previous as never)},
        ${next.fails}, ${next.detail}, now(), ${news === "changed" ? new Date() : null})
      ON CONFLICT (store_id, url) DO UPDATE SET labels = EXCLUDED.labels, status = EXCLUDED.status, digest = EXCLUDED.digest,
        sentences = EXCLUDED.sentences, previous = EXCLUDED.previous, fails = EXCLUDED.fails, detail = EXCLUDED.detail,
        checked_at = now(), changed_at = COALESCE(EXCLUDED.changed_at, store_fact_checks.changed_at)`;
    result.checked++;
    const what = `${job.store.name} (${job.labels.join(", ")})`;
    if (news === "changed") {
      result.changed.push(what);
      const d = sentenceDiff(next.previous, next.sentences);
      notices.push(`🔎 Ha cambiado la página de ${what}: ${job.url}`, ...d.added.slice(0, 3).map((s) => `  + ${s}`), ...d.removed.slice(0, 3).map((s) => `  − ${s}`));
    }
    if (news === "unreadable") {
      result.unreadable.push(what);
      notices.push(`⚠️ No se puede leer la página de ${what} desde hace ${next.fails} días: ${next.detail}. ${job.url}`);
    }
  });
  await notify(notices);
  return result;
}

async function notify(lines: string[]) {
  const cfg = telegramConfig();
  if (!cfg || !lines.length) return;
  try {
    const text = ["Datos de tienda:", ...lines, "", `Revisar y corregir: ${siteUrl()}/panel/guias#revision-datos`].join("\n").slice(0, 4000);
    await tg(cfg, "sendMessage", { chat_id: cfg.adminChatId, text, disable_web_page_preview: true });
  } catch (e) {
    console.error("store facts telegram notice failed", e); // the panel shows it anyway
  }
}

// Every checked page, the ones that need someone first; [] until the migration runs
export async function factCheckRows(): Promise<FactCheckRow[]> {
  try {
    return await sql()<FactCheckRow[]>`
      SELECT c.store_id, s.slug, s.name, c.url, c.labels, c.status, c.sentences, c.previous, c.fails, c.detail, c.checked_at, c.changed_at
      FROM store_fact_checks c JOIN stores s ON s.id = c.store_id
      ORDER BY CASE c.status WHEN 'changed' THEN 0 WHEN 'unreadable' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END, s.name, c.url`;
  } catch (e) {
    if (isMissingSchema(e)) return [];
    throw e;
  }
}

// «Ya está revisado»: the page as read now is the new baseline
export async function markFactCheckReviewed(storeId: number, url: string): Promise<string | undefined> {
  const [row] = await sql()<{ name: string }[]>`
    UPDATE store_fact_checks c SET status = 'ok', previous = '[]'::jsonb FROM stores s
    WHERE s.id = c.store_id AND c.store_id = ${storeId} AND c.url = ${url} AND c.status = 'changed' RETURNING s.name`;
  return row?.name;
}

// The store's sources text, or "" until the migration adds the column
export async function storeFactSources(storeId: number): Promise<string> {
  try {
    const [row] = await sql()<{ facts_sources: string }[]>`SELECT facts_sources FROM stores WHERE id = ${storeId}`;
    return row?.facts_sources ?? "";
  } catch (e) {
    if (isMissingSchema(e)) return "";
    throw e;
  }
}
