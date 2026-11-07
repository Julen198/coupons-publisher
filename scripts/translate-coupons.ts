// Translates into Spanish the live coupons of Spanish-site stores whose title or conditions came in another language
// (English, French, German, Italian, Portuguese). DRY RUN by default: lists what would be translated, with the
// detected language and an estimated cost, and changes nothing.
//   node scripts/translate-coupons.ts [--limit=N] [--only=12,34]
//   node scripts/translate-coupons.ts --apply [--limit=N] [--only=12,34]   calls the AI (Costes de IA) and saves as 'auto'
// --limit: how many coupons go to the AI at most (default 100). --only: those coupon ids, even if already checked.
// Needs npm run db:setup first (coupons.title_es…) and the AI Gateway auth in .env.local (vercel env pull).
import nextEnv from "@next/env";
import postgres from "postgres";
import { MISSING_COLUMNS, runTranslations } from "../src/lib/translate-run.ts";
import { LANG_NAMES, parseTranslateArgs } from "../src/lib/translation.ts";

nextEnv.loadEnvConfig(process.cwd());

const args = (() => {
  try {
    return parseTranslateArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
})();
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL en .env.local");
  process.exit(1);
}

const usd = (v: number) => `$${v.toFixed(v < 1 ? 4 : 2)}`;
const short = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
try {
  console.log(args.apply ? "APLICANDO: se llama a la IA y se guardan las traducciones" : "Simulación: no se cambia nada (añade --apply para traducir)");
  const r = await runTranslations(sql, { apply: args.apply, limit: args.limit, only: args.only, userName: "scripts/translate-coupons" });
  if (r.error === MISSING_COLUMNS) throw new Error(MISSING_COLUMNS);

  for (const c of r.pending) {
    console.log(`· #${c.id} ${c.store_name} [${c.lang ? LANG_NAMES[c.lang] : "otro idioma"}] ${short(c.title)}${c.description ? `\n    ${short(c.description)}` : ""}`);
  }
  console.log(`\n${r.pending.length} cupón(es) para traducir${r.waiting ? ` (y ${r.waiting} más fuera del --limit)` : ""}.`);
  console.log(`Coste estimado: ${usd(r.estimate.cost)} (${r.estimate.input} tokens de entrada, ${r.estimate.output} de salida).`);
  if (args.apply) {
    console.log(`${r.translated} traducidos, ${r.checked} ya en español o sin texto que traducir, coste real ${usd(r.cost)}.`);
    for (const x of r.rejected) console.log(`  ✗ #${x.id} no se guarda (${x.reason}): se queda en su idioma original`);
    if (r.stopped === "time") console.log("Parado por tiempo.");
    if (r.error) console.error(`Parado: ${r.error}`);
    if (r.stopped === "error") process.exitCode = 1;
  }
} catch (e) {
  console.error("Error:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await sql.end();
}
