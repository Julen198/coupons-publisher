// Postgres "undefined_column" / "undefined_table": code written ahead of its migration (SCHEMA_SQL) checks this
// to keep working the old way until the column or table exists, instead of failing the page.
const MISSING = new Set(["42703", "42P01"]);

export function isMissingSchema(e: unknown): boolean {
  return typeof e === "object" && e !== null && MISSING.has(String((e as { code?: unknown }).code));
}
