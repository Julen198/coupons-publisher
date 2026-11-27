// Hourly cron: tells IndexNow (Bing and the others) which pages are new, changed or gone since the last run, so new
// coupons, stores and guides reach Bing (and through it ChatGPT search and Copilot) in about an hour, with nobody
// submitting anything by hand. What was sent is kept in indexnow_pages; the first run sends the whole sitemap.
import { sql } from "./db";
import { sitemapEntries } from "./sitemap-entries";
import { pagesToPing, pingBatch } from "./indexnow-sync.ts";
import { pingIndexNow } from "./guide-index";

// Created here too (not only by db:setup), so the cron works the first time it runs after a deploy
const TABLE_SQL = `CREATE TABLE IF NOT EXISTS indexnow_pages (
  path text PRIMARY KEY,
  sig text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE indexnow_pages ENABLE ROW LEVEL SECURITY;`;

export interface IndexNowRun { pages: number; sent: number; changed: number; gone: number; ok: boolean }

export async function runIndexNowCron(): Promise<IndexNowRun> {
  await sql().unsafe(TABLE_SQL);
  const [current, rows] = await Promise.all([sitemapEntries(), sql()<{ path: string; sig: string }[]>`SELECT path, sig FROM indexnow_pages`]);
  const { changed, gone } = pagesToPing(current, new Map(rows.map((r) => [r.path, r.sig])));
  const batch = pingBatch(changed, gone);
  if (!batch.length) return { pages: current.length, sent: 0, changed: 0, gone: 0, ok: true };
  const ok = await pingIndexNow(batch);
  // Only what reached IndexNow is remembered: a refused ping is tried again next hour
  if (ok) {
    const sent = new Set(batch);
    const sigs = current.filter((p) => sent.has(p.path));
    if (sigs.length) {
      await sql()`INSERT INTO indexnow_pages ${sql()(sigs.map((p) => ({ path: p.path, sig: p.sig })), "path", "sig")}
        ON CONFLICT (path) DO UPDATE SET sig = EXCLUDED.sig, sent_at = now()`;
    }
    const left = gone.filter((p) => sent.has(p));
    if (left.length) await sql()`DELETE FROM indexnow_pages WHERE path = ANY(${left})`;
  }
  console.log("IndexNow cron", { pages: current.length, sent: batch.length, changed: changed.length, gone: gone.length, ok });
  return { pages: current.length, sent: batch.length, changed: changed.length, gone: gone.length, ok };
}
