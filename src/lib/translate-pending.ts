import { sql } from "./db";
import { runTranslations } from "./translate-run.ts";

const LIMIT = 100; // 5 calls; the rest wait for the next sync or scripts/translate-coupons.ts
const BUDGET_MS = 60_000;

// After a network sync's response: Spanish versions of the new or changed coupons that came in another language.
// Skipped (with a log line) until npm run db:setup adds the columns, over the monthly AI budget or out of time.
export async function translatePending(): Promise<void> {
  try {
    const r = await runTranslations(sql(), { apply: true, limit: LIMIT, userName: "Sincronización de redes", timeBudgetMs: BUDGET_MS });
    if (r.error) console.error("[translate]", r.error);
    if (r.rejected.length) console.error("[translate] kept in their original language", r.rejected);
  } catch (e) {
    console.error("[translate] run failed", e);
  }
}
