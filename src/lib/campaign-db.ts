// The published campaign texts, for the public pages (/ofertas/<evento>/<tienda> and the sitemap). Its own small module
// so the pages don't pull in the cron (AI, Telegram). Before the cron has created campaign_guides, nothing is published.
import { cache } from "react";
import { sql } from "./db";
import type { StoreGuide } from "./store-guides.ts";

export async function publishedCampaign(storeId: number, event: string): Promise<{ guide: StoreGuide; year: number; publishedAt: Date | null } | undefined> {
  try {
    const [row] = await sql()<{ content: StoreGuide; year: number; published_at: Date | null }[]>`
      SELECT content, year, published_at FROM campaign_guides WHERE store_id = ${storeId} AND event = ${event} AND status = 'published'`;
    return row ? { guide: row.content, year: row.year, publishedAt: row.published_at } : undefined;
  } catch {
    return undefined;
  }
}

// Every published store × date text: (event, store slug, year)
export const publishedCampaigns = cache(async (): Promise<{ event: string; slug: string; year: number }[]> => {
  try {
    const rows = await sql()<{ event: string; slug: string; year: number }[]>`
      SELECT g.event, s.slug, g.year FROM campaign_guides g JOIN stores s ON s.id = g.store_id WHERE g.status = 'published'`;
    return rows.map((r) => ({ ...r }));
  } catch {
    return [];
  }
});
