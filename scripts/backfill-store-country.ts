// Fills stores.country for stores that have none, from their name, slug and web (inferStoreCountry).
// DRY RUN by default: only reads stores and lists slug → country (reason).
//   node scripts/backfill-store-country.ts            what it would write
//   node scripts/backfill-store-country.ts --apply    writes them, with country_source 'inferred'
// Never touches a store whose country is already set, nor one an editor ('manual') or a network ('network') decided.
// Needs npm run db:setup first (the country columns).
import nextEnv from "@next/env";
import postgres from "postgres";
import { planCountryBackfill, type BackfillRow } from "../src/lib/country-backfill.ts";
import { isMissingSchema } from "../src/lib/schema-guard.ts";

nextEnv.loadEnvConfig(process.cwd());

const apply = process.argv.includes("--apply");
const unknown = process.argv.slice(2).filter((a) => a !== "--apply");
if (unknown.length) {
  console.error(`Opción desconocida: ${unknown.join(" ")}. Usa --apply para escribir`);
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL en .env.local");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
try {
  const rows = await sql<BackfillRow[]>`
    SELECT id, slug, name, website, tracking_url, country, country_source FROM stores ORDER BY lower(name)`;
  const plan = planCountryBackfill(rows.map((r) => ({ ...r })));
  for (const u of plan.updates) console.log(`${u.slug} → ${u.country} (${u.reason})`);
  console.log(`\n${plan.updates.length} tiendas con país deducido · ${plan.noSignal.length} sin señal · ${plan.kept.length} ya decididas`);
  if (plan.noSignal.length) console.log(`Sin señal (se quedan sin definir, la web mira su dominio): ${plan.noSignal.join(", ")}`);
  const foreign = plan.updates.filter((u) => u.country !== "ES");
  if (foreign.length) console.log(`De otro país (no salen en la web): ${foreign.map((u) => `${u.slug} ${u.country}`).join(", ")}`);
  if (!apply) {
    console.log("\nDry run: no se ha escrito nada. Añade --apply para guardarlo.");
  } else {
    let written = 0;
    for (const u of plan.updates) {
      const res = await sql`
        UPDATE stores SET country = ${u.country}, country_source = 'inferred'
        WHERE id = ${u.id} AND country = '' AND country_source NOT IN ('manual', 'network')`;
      written += res.count;
    }
    console.log(`\nGuardado el país de ${written} tiendas.`);
  }
} catch (e) {
  console.error(isMissingSchema(e) ? "Faltan las columnas de país. Ejecuta antes npm run db:setup" : `Error: ${e instanceof Error ? e.message : e}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
