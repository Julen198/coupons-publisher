// Looks for a better logo for every store (web manifest, touch icon, page icons, og:logo, schema.org, Google)
// and writes a review page. DRY RUN by default: only reads stores.
//   node scripts/refresh-logos.ts [--only=slug1,slug2] [--out=/path/review.html]
//   node scripts/refresh-logos.ts --apply [--only=...]          updates logo_data where the proposal is bigger
//   node scripts/refresh-logos.ts --only=slug --force [--apply]  replaces even if not bigger
//   node scripts/refresh-logos.ts --only=slug --from=https://.../logo.svg [--apply]   a logo you picked by hand
//   node scripts/refresh-logos.ts --clear --only=slug1,slug2      remove their logos (the site shows initials)
// --wordmarks: the same for wordmark_data, the logo WITH the name for the landscape boxes (schema.org logo, og:logo,
// the header's logo picture or inline SVG); review page shows them at 120x50 and 240x100. Needs npm run db:setup first.
//   node scripts/refresh-logos.ts --wordmarks [--only=...] [--apply] [--force] [--from=https://.../logo.svg] [--clear]
import nextEnv from "@next/env";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { isBetterLogo } from "../src/lib/logo-choice.ts";
import { downloadLogo, fetchLogo, placeholderHashes, type FetchedLogo } from "../src/lib/logo-fetch.ts";
import { logoDataInfo, parseRefreshArgs, renderLogoReview, type ReviewRow } from "../src/lib/logo-review.ts";
import { isMissingSchema } from "../src/lib/schema-guard.ts";
import { isWordmarkShape } from "../src/lib/wordmark-choice.ts";
import { downloadWordmark, fetchWordmark } from "../src/lib/wordmark-fetch.ts";

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
const out = args.out || join(tmpdir(), args.wordmarks ? "wordmarks-review.html" : "logos-review.html");
// which column this run reads and writes
const COLUMN = args.wordmarks ? "wordmark_data" : "logo_data";
const WHAT = args.wordmarks ? "wordmark" : "logo";

interface Store {
  slug: string;
  name: string;
  website: string;
  current: string; // logo_data or wordmark_data
}

type Proposal = { logo: Pick<FetchedLogo, "dataUri" | "url" | "type" | "width" | "height" | "bytes"> | null; tried: { url: string; source: string; result: string }[]; source: string };
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function proposeWordmark(store: Store): Promise<Proposal> {
  if (args.from) {
    try {
      const w = await downloadWordmark(args.from, "manual");
      const shape = isWordmarkShape(w) ? "" : " · not wide (se acepta: lo has elegido tú)";
      return { logo: w, tried: [{ url: args.from, source: "manual", result: `${w.width}x${w.height} ${w.type}${shape}` }], source: "manual (--from)" };
    } catch (e) {
      return { logo: null, tried: [{ url: args.from, source: "manual", result: errorText(e) }], source: "" };
    }
  }
  const found = await fetchWordmark(store.website);
  return { logo: found.wordmark, tried: found.tried, source: found.wordmark?.source ?? "" };
}

async function propose(store: Store, placeholders: Set<string>): Promise<Proposal> {
  if (args.wordmarks) return proposeWordmark(store);
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
  const info = logoDataInfo(store.current);
  const current = { dataUri: store.current, info };
  try {
    const { logo, tried, source } = await propose(store, placeholders);
    const proposed = logo ? { dataUri: logo.dataUri, source, url: logo.url, type: logo.type, width: logo.width, height: logo.height, bytes: logo.bytes } : null;
    const willUpdate = !!logo && logo.dataUri !== store.current && (args.force || isBetterLogo(info, logo));
    return { name: store.name, slug: store.slug, current, proposed, willUpdate, tried };
  } catch (e) {
    return { name: store.name, slug: store.slug, current, proposed: null, willUpdate: false, tried: [], error: e instanceof Error ? e.message : String(e) };
  }
}

const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });

// --clear --only=a,b: forget those stores' logos; the site shows their initials instead
if (args.clear) {
  const gone = await sql`UPDATE stores SET ${sql(COLUMN)} = '' WHERE slug = ANY(${args.only}) RETURNING slug`.catch(async (e) => {
    console.error(isMissingSchema(e) ? "Falta la columna wordmark_data: ejecuta antes npm run db:setup" : errorText(e));
    await sql.end();
    process.exit(1);
  });
  console.log(`${args.wordmarks ? "Wordmark" : "Logo"} quitado en ${gone.length} tienda(s): ${gone.map((r) => r.slug).join(", ") || "ninguna (revisa los slugs)"}`);
  await sql.end();
  process.exit(0);
}
try {
  const stores = args.only.length
    ? await sql<Store[]>`SELECT slug, name, website, ${sql(COLUMN)} AS current FROM stores WHERE slug IN ${sql(args.only)} ORDER BY name`
    : await sql<Store[]>`SELECT slug, name, website, ${sql(COLUMN)} AS current FROM stores ORDER BY name`;
  const missing = args.only.filter((s) => !stores.some((x) => x.slug === s));
  if (missing.length) console.warn(`No existen: ${missing.join(", ")}`);
  console.log(`${stores.length} tiendas. Buscando ${WHAT}s (${args.apply ? "APLICANDO cambios" : "simulación, no se cambia nada"})…`);

  const placeholders = args.wordmarks ? new Set<string>() : await placeholderHashes();
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
      const res = await sql`UPDATE stores SET ${sql(COLUMN)} = ${r.proposed!.dataUri} WHERE slug = ${r.slug} AND ${sql(COLUMN)} = ${r.current.dataUri}`;
      updated += res.count;
    }
  }

  writeFileSync(out, renderLogoReview(rows, { apply: args.apply, generatedAt: new Date().toISOString(), kind: args.wordmarks ? "wordmark" : "icon" }));
  const better = rows.filter((r) => r.willUpdate).length;
  console.log(`\n${better} con un ${WHAT} mejor${args.apply ? `, ${updated} actualizadas` : " (ejecuta con --apply para guardarlos)"}.`);
  console.log(`Revisión: ${out}`);
} catch (e) {
  console.error("Error:", isMissingSchema(e) ? "falta la columna wordmark_data: ejecuta antes npm run db:setup" : errorText(e));
  process.exitCode = 1;
} finally {
  await sql.end();
}
