import { sql } from "./db";
import { fetchOgImage, runWithBudget } from "./og-image-fetch.ts";

const CONCURRENCY = 4;
const BUDGET_MS = 60_000;
const BATCH = 100; // more than a 60 s run gets through; the rest wait for the next one

// After the response: product photos for deals with none, read once from their landing page's og:image.
// Each deal is tried once (again after 30 days if it still has none); deals the run didn't reach stay untried.
// An image already there (a network feed's) is never replaced. `ids` limits the run to those deals.
export async function fillProductImages(ids?: number[]): Promise<void> {
  try {
    const only = ids?.filter((id) => Number.isInteger(id) && id > 0);
    if (only && !only.length) return;
    const due = await sql()<{ id: number; target_url: string }[]>`
      SELECT id, target_url FROM coupons
      WHERE image_url = '' AND target_url <> '' AND archived = 0 AND review = ''
        AND (image_checked_at IS NULL OR image_checked_at < now() - interval '30 days')
        ${only ? sql()`AND id = ANY(${only}::int[])` : sql()``}
      ORDER BY id DESC LIMIT ${BATCH}`;
    const homeImages = new Map<string, Promise<string | null>>();
    await runWithBudget(due, async (c) => {
      const image = (await fetchOgImage(c.target_url, homeImages)) ?? "";
      await sql()`
        UPDATE coupons SET image_checked_at = now(),
          image_url = CASE WHEN image_url = '' THEN ${image} ELSE image_url END
        WHERE id = ${c.id}`;
    }, { concurrency: CONCURRENCY, budgetMs: BUDGET_MS });
  } catch (e) {
    console.error("[og-image] fill failed", e);
  }
}
