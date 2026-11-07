import { isMissingSchema } from "./schema-guard.ts";

// stores.wordmark_data arrives with a migration (SCHEMA_SQL, npm run db:setup). Until it exists, queries run without it
// (no store has a wordmark) instead of failing; once seen missing, it is tried again only every few minutes.
const RETRY_MS = 5 * 60_000;
let missingAt = Number.NEGATIVE_INFINITY;

export async function withWordmarkColumn<T>(run: (present: boolean) => Promise<T>, now: () => number = Date.now): Promise<T> {
  if (now() - missingAt >= RETRY_MS) {
    try {
      return await run(true);
    } catch (e) {
      if (!isMissingSchema(e)) throw e;
      missingAt = now();
    }
  }
  return run(false);
}

// For SELECTs on stores aliased `alias`: whether it has a wordmark, or plain false while the column is missing
export const hasWordmarkSql = (present: boolean, alias: string): string => (present ? `${alias}.wordmark_data <> ''` : "false");
