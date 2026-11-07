// Looks for a better logo for every store (web manifest, touch icon, page icons, og:logo, schema.org, Google)
// and writes a review page. DRY RUN by default: only reads stores.
//   node scripts/refresh-logos.ts [--only=slug1,slug2] [--out=/path/review.html]
//   node scripts/refresh-logos.ts --apply [--only=...]          updates logo_data where the proposal is bigger
//   node scripts/refresh-logos.ts --only=slug --force [--apply]  replaces even if not bigger
//   node scripts/refresh-logos.ts --only=slug --from=https://.../logo.svg [--apply]   a logo you picked by hand
import nextEnv from "@next/env";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { isBetterLogo } from "../src/lib/logo-choice.ts";
import { downloadLogo, fetchLogo, placeholderHashes, type FetchedLogo, type LogoAttempt } from "../src/lib/logo-fetch.ts";
import { logoDataInfo, parseRefreshArgs, renderLogoReview, type ReviewRow } from "../src/lib/logo-review.ts";

const CONCURRENCY = 4;

nextEnv.loadEnvConfig(process.cwd());

const args = (() => {
  try {
    return parseRefreshArgs(process.argv.slice(2));
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
const out = args.out || join(tmpdir(), "logos-review.html");

interface Store {
  slug: string;
  name: string;
  website: string;
  logo_data: string;
}

async function propose(store: Store, placeholders: Set<string>): Promise<{ logo: FetchedLogo | null; tried: LogoAttempt[]; source: string }> {
  if (args.from) {
    try {
      const logo = await downloadLogo(args.from, "icon");
      return { logo, tried: [{ url: args.from, source: "icon", result: `${logo.width}x${logo.height} ${logo.type}` }], source: "manual (--from)" };
    } catch (e) {
      return { logo: null, tried: [{ url: args.from, source: "icon", result: e instanceof Error ? e.message : String(e) }], source: "" };
    }
  }
  const found = await fetchLogo(store.website, { placeholders });
  return { ...found, source: found.logo?.source ?? "" };
}

async function review(store: Store, placeholders: Set<string>): Promise<ReviewRow> {
  const info = logoDataInfo(store.logo_data);
  const current = { dataUri: store.logo_data, info };
  try {
    const { logo, tried, source } = await propose(store, placeholders);
    const proposed = logo ? { dataUri: logo.dataUri, source, url: logo.url, type: logo.type, width: logo.width, height: logo.height, bytes: logo.bytes } : null;
    const willUpdate = !!logo && logo.dataUri !== store.logo_data && (args.force || isBetterLogo(info, logo));
    return { name: store.name, slug: store.slug, current, proposed, willUpdate, tried };
  } catch (e) {
    return { name: store.name, slug: store.slug, current, proposed: null, willUpdate: false, tried: [], error: e instanceof Error ? e.message : String(e) };
  }
}

const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
try {
  const stores = args.only.length
    ? await sql<Store[]>`SELECT slug, name, website, logo_data FROM stores WHERE slug IN ${sql(args.only)} ORDER BY name`
    : await sql<Store[]>`SELECT slug, name, website, logo_data FROM stores ORDER BY name`;
  const missing = args.only.filter((s) => !stores.some((x) => x.slug === s));
  if (missing.length) console.warn(`No existen: ${missing.join(", ")}`);
  console.log(`${stores.length} tiendas. Buscando logos (${args.apply ? "APLICANDO cambios" : "simulación, no se cambia nada"})…`);

  const placeholders = await placeholderHashes();
  const rows: ReviewRow[] = new Array(stores.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let i = next++; i < stores.length; i = next++) {
        rows[i] = await review(stores[i], placeholders);
        const r = rows[i];
        console.log(`${r.willUpdate ? "↑" : "·"} ${r.slug}: ${r.proposed ? `${r.proposed.source} ${Math.round(r.proposed.width)}x${Math.round(r.proposed.height)}` : r.error ?? "sin propuesta"}`);
      }
    }),
  );

  let updated = 0;
  if (args.apply) {
    for (const r of rows.filter((x) => x.willUpdate && x.proposed)) {
      // only if nobody changed it meanwhile
      const res = await sql`UPDATE stores SET logo_data = ${r.proposed!.dataUri} WHERE slug = ${r.slug} AND logo_data = ${r.current.dataUri}`;
      updated += res.count;
    }
  }

  writeFileSync(out, renderLogoReview(rows, { apply: args.apply, generatedAt: new Date().toISOString() }));
  const better = rows.filter((r) => r.willUpdate).length;
  console.log(`\n${better} con un logo mejor${args.apply ? `, ${updated} actualizadas` : " (ejecuta con --apply para guardarlos)"}.`);
  console.log(`Revisión: ${out}`);
} catch (e) {
  console.error("Error:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await sql.end();
}
