import { isMissingSchema } from "./schema-guard.ts";

// Columns that arrive with the tracking migration (SCHEMA_SQL, npm run db:setup): stores.alt_domains, clicks.kind / ref /
// ua_hash, network_accounts.last_success_at. Until they exist, queries run the old way instead of failing (same pattern
// as withCountryColumn); once seen missing, they are tried again only every few minutes. Only an error naming one of a
// guard's own columns counts, so another missing column is never taken for it.
const RETRY_MS = 5 * 60_000;

export interface ColumnGuard {
  isMissing: (e: unknown) => boolean;
  run: <T>(run: (present: boolean) => Promise<T>, now?: () => number) => Promise<T>;
}

export function columnGuard(names: RegExp): ColumnGuard {
  let missingAt = Number.NEGATIVE_INFINITY;
  const isMissing = (e: unknown): boolean => isMissingSchema(e) && names.test(String((e as { message?: unknown }).message));
  return {
    isMissing,
    async run<T>(run: (present: boolean) => Promise<T>, now: () => number = Date.now): Promise<T> {
      if (now() - missingAt >= RETRY_MS) {
        try {
          return await run(true);
        } catch (e) {
          if (!isMissing(e)) throw e;
          missingAt = now();
        }
      }
      return run(false);
    },
  };
}

export const altDomainsColumn = columnGuard(/\balt_domains\b/);
export const clickColumns = columnGuard(/\b(kind|ref|ua_hash)\b/);

// For SELECTs on stores aliased `alias`
export const altDomainsSql = (present: boolean, alias: string, as = "store_alt_domains"): string =>
  present ? `${alias}.alt_domains AS ${as}` : `'' AS ${as}`;
