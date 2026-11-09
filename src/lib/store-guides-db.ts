// The published automatic guide of a store, for its public page. Its own small module so the page doesn't pull in the
// cron (AI, Telegram). A hand-written guide in store-guides.ts wins over it.
import { sql } from "./db";
import type { StoreGuide } from "./store-guides.ts";

export async function publishedGuide(storeId: number): Promise<StoreGuide | undefined> {
  try {
    const [row] = await sql()<{ content: StoreGuide }[]>`SELECT content FROM store_guides WHERE store_id = ${storeId} AND status = 'published'`;
    return row?.content;
  } catch (e) {
    console.error("store guide read failed", e); // the page renders without it rather than failing (e.g. before db:setup)
    return undefined;
  }
}
