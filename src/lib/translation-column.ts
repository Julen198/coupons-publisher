import { isMissingSchema } from "./schema-guard.ts";

// coupons.title_es, description_es, translation_status and translated_from arrive with a migration (SCHEMA_SQL,
// npm run db:setup). Until they exist, queries read "" (no translation: the original text shows) instead of failing;
// once seen missing, they are tried again only every few minutes. Only an error naming them counts.
// SELECT c.* picks them up by itself once they exist; this is for queries that name their columns.
export const MISSING_COLUMNS = "Faltan las columnas de traducción: ejecuta antes npm run db:setup";

const RETRY_MS = 5 * 60_000;
let missingAt = Number.NEGATIVE_INFINITY;

export const isMissingTranslation = (e: unknown): boolean =>
  isMissingSchema(e) && /\b(title_es|description_es|translation_status|translated_from)\b/.test(String((e as { message?: unknown }).message));

export async function withTranslationColumns<T>(run: (present: boolean) => Promise<T>, now: () => number = Date.now): Promise<T> {
  if (now() - missingAt >= RETRY_MS) {
    try {
      return await run(true);
    } catch (e) {
      if (!isMissingTranslation(e)) throw e;
      missingAt = now();
    }
  }
  return run(false);
}

const COLUMNS = ["title_es", "description_es", "translation_status", "translated_from"] as const;

// For SELECTs on coupons aliased `alias`: the four columns, or "" for each while they are missing
export const translationSql = (present: boolean, alias: string): string =>
  COLUMNS.map((c) => (present ? `${alias}.${c}` : `'' AS ${c}`)).join(", ");
