import { sql } from "./db";
import { isMissingSchema } from "./schema-guard.ts";

// network_accounts.last_success_at: when the account last synced without error (last_sync_at / last_error say when it
// last tried and how that went). Skipped until npm run db:setup adds the column.
export async function recordSuccess(accountId: number): Promise<void> {
  try {
    await sql()`UPDATE network_accounts SET last_success_at = now() WHERE id = ${accountId}`;
  } catch (e) {
    if (!(isMissingSchema(e) && /last_success_at/.test(String((e as { message?: unknown }).message)))) throw e;
  }
}
