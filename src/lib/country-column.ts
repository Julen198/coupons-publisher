import { isMissingSchema } from "./schema-guard.ts";

// stores.country and stores.country_source arrive with a migration (SCHEMA_SQL, npm run db:setup). Until they exist,
// queries read "" (no stored country: the site infers it, see onSpanishSite) instead of failing; once seen missing,
// they are tried again only every few minutes. Only an error naming them counts, so a missing wordmark_data
// (withWordmarkColumn) is not taken for this one.
const RETRY_MS = 5 * 60_000;
let missingAt = Number.NEGATIVE_INFINITY;

export const isMissingCountry = (e: unknown): boolean => isMissingSchema(e) && /\bcountry(_source)?\b/.test(String((e as { message?: unknown }).message));

export async function withCountryColumn<T>(run: (present: boolean) => Promise<T>, now: () => number = Date.now): Promise<T> {
  if (now() - missingAt >= RETRY_MS) {
    try {
      return await run(true);
    } catch (e) {
      if (!isMissingCountry(e)) throw e;
      missingAt = now();
    }
  }
  return run(false);
}

// For SELECTs on stores aliased `alias`: country and country_source as <prefix>country / <prefix>country_source
export const countrySql = (present: boolean, alias: string, prefix = "store_"): string =>
  present
    ? `${alias}.country AS ${prefix}country, ${alias}.country_source AS ${prefix}country_source`
    : `'' AS ${prefix}country, '' AS ${prefix}country_source`;
