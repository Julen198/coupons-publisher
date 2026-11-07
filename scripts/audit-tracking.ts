// Launch check for outgoing links, READ ONLY: SELECTs inside BEGIN TRANSACTION READ ONLY, no network calls, no tracking
// URL is ever requested. Recomputes every coupon the public site would show with the same rules as siteCoupons()
// (isPublic, onSpanishSite, dedupe) and the launch gate (trackedLinkOf), then re-checks each public link on its own:
// https, the network's host, our publisher id, the merchant, the clickref and a destination on the store's domains.
//   node scripts/audit-tracking.ts
// Prints totals per network, why each hidden coupon is hidden, and every problem left in a public link (our publisher
// ids masked). Exits 1 when a public coupon has a problem: that is the launch gate failing.
import nextEnv from "@next/env";
import postgres from "postgres";
import { isPublic } from "../src/lib/coupon-status.ts";
import { onSpanishSite } from "../src/lib/market.ts";
import { dedupeDeals } from "../src/lib/deal-text.ts";
import { madridToday } from "../src/lib/site-text.ts";
import { isTracked, registrableDomain, storeDomains, trackedLinkOf, type LinkStore } from "../src/lib/tracked-link.ts";

nextEnv.loadEnvConfig(process.cwd(), false, { info: () => {}, error: console.error });
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL en .env.local");
  process.exit(1);
}
const SITE_SLUG = process.env.SITE_CLIENT_SLUG || "cuponlab";

type StoreRow = LinkStore & { id: number; name: string; country: string; country_source: string };
type CouponRow = {
  id: number; store_id: number; title: string; code: string; verified: number; archived: number; source: string; review: string;
  expires_at: string; target_url: string; publisher_id: string;
};

const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });

async function load() {
  return sql.begin("TRANSACTION READ ONLY", async (tx) => {
    const cols = await tx<{ table_name: string; column_name: string }[]>`
      SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('stores', 'clicks')`;
    const has = (t: string, c: string) => cols.some((r) => r.table_name === t && r.column_name === c);
    const [pu] = await tx<{ value: string }[]>`SELECT value FROM settings WHERE key = 'publish_unverified'`;
    const [client] = await tx<{ id: number; slug: string; awin_affiliate_id: string }[]>`SELECT id, slug, awin_affiliate_id FROM clients WHERE slug = ${SITE_SLUG}`;
    const own = client ? await tx<{ store_id: number; network: string; tracking_url: string }[]>`SELECT store_id, network, tracking_url FROM client_tracking WHERE client_id = ${client.id}` : [];
    const awin = await tx<{ account_ref: string }[]>`SELECT account_ref FROM network_accounts WHERE network = 'awin' AND client_id IS NULL`;
    const stores = await tx<StoreRow[]>`
      SELECT id, name, slug, website, network, merchant_id, tracking_url, publisher_id,
             ${has("stores", "country") ? tx`country, country_source` : tx`'' AS country, '' AS country_source`},
             ${has("stores", "alt_domains") ? tx`alt_domains` : tx`'' AS alt_domains`}
      FROM stores`;
    const coupons = await tx<CouponRow[]>`
      SELECT id, store_id, title, code, verified, archived, source, review, expires_at, target_url, publisher_id
      FROM coupons WHERE archived = 0 ORDER BY verified DESC, id DESC`;
    return {
      unverified: pu?.value === "1", client, own, stores: stores.map((s) => ({ ...s })), coupons: coupons.map((c) => ({ ...c })),
      awinPublishers: new Set(awin.map((a) => a.account_ref.replace(/^Publisher\s+/i, "").trim()).filter(Boolean)),
      migrated: has("stores", "alt_domains") && has("clicks", "kind"),
    };
  });
}

// Our ids never go to the terminal in full
const masker = (ids: Iterable<string>) => {
  const list = [...ids].filter((id) => id.length >= 4);
  return (s: string) => list.reduce((out, id, i) => out.split(id).join(`<OUR_ID_${i + 1}>`), s);
};

const DEST_KEYS = ["ued", "url", "murl", "u", "ulp", "wgtarget", "redir", "dl"];

// Independent re-check of a built link (not trusting trackedLinkOf's own verdict)
function verify(link: string, clickref: string, store: StoreRow, ourAwin: ReadonlySet<string>, clientAwin: string): string[] {
  const out: string[] = [];
  if (!URL.canParse(link)) return ["URL no válida"];
  const u = new URL(link);
  if (u.protocol !== "https:") out.push("no es https");
  if (!link.includes(clickref) && !link.includes(encodeURIComponent(clickref)) && store.network !== "admitad") out.push("sin clickref");
  if (store.network === "awin") {
    if (u.hostname !== "www.awin1.com") out.push(`host ${u.hostname}`);
    const aff = u.searchParams.get("awinaffid") ?? "";
    if (!aff || !(ourAwin.has(aff) || aff === clientAwin)) out.push("awinaffid que no es nuestro");
    if (u.searchParams.get("awinmid") !== store.merchant_id) out.push("awinmid distinto del merchant de la tienda");
  }
  const domains = storeDomains(store);
  const destRaw = store.network === "affilae" ? link
    : store.network === "partnerize" ? decodeURIComponent(u.pathname.split("/destination:")[1] ?? "")
    : DEST_KEYS.map((k) => u.searchParams.get(k)).find((v) => v && /^https?:\/\//.test(v)) ?? "";
  if (destRaw) {
    if (!URL.canParse(destRaw)) out.push("destino no válido");
    else {
      const d = new URL(destRaw);
      if (d.protocol !== "https:") out.push("destino no https");
      if (!domains.includes(registrableDomain(d.hostname))) out.push(`destino en ${d.hostname}, fuera de la tienda`);
    }
  }
  return out;
}

try {
  const data = await load();
  const today = madridToday().iso;
  const storeById = new Map(data.stores.map((s) => [s.id, s]));
  const ownBy = new Map(data.own.map((o) => [o.store_id, o]));
  const client = data.client ?? { id: 0, slug: SITE_SLUG, awin_affiliate_id: "" };
  const mask = masker([...data.awinPublishers, client.awin_affiliate_id]);

  // what siteCoupons() would show without the gate (the old public set), then with it
  const rows = data.coupons.flatMap((c) => {
    const s = storeById.get(c.store_id);
    return s ? [{ ...c, s }] : [];
  });
  const linkOf = (c: (typeof rows)[number]) => {
    const tpl = ownBy.get(c.s.id);
    return trackedLinkOf(c, c.s, { client, clientTemplate: tpl && tpl.network === c.s.network ? tpl.tracking_url : "", awinPublishers: data.awinPublishers });
  };
  const visible = rows.filter((c) => isPublic(c, today, data.unverified) && onSpanishSite(c.s));
  // the public set exactly as siteCoupons builds it (gate, then dedupe), plus the untracked ones the gate hides
  const shown = dedupeDeals(visible.filter((c) => isTracked(linkOf(c))));
  const judged = [...shown, ...dedupeDeals(visible.filter((c) => !isTracked(linkOf(c))))].map((c) => ({ c, link: linkOf(c) }));

  const byNet = new Map<string, { before: number; public: number; hidden: number }>();
  const reasons = new Map<string, number>();
  const notes = new Map<string, number[]>();
  const hidden: string[] = [];
  const problems: string[] = [];
  for (const { c, link } of judged) {
    const row = byNet.get(c.s.network) ?? { before: 0, public: 0, hidden: 0 };
    row.before++;
    if (isTracked(link)) {
      row.public++;
      for (const n of link.notes) notes.set(n, [...(notes.get(n) ?? []), c.id]);
      for (const p of verify(link.url, link.clickref, c.s, data.awinPublishers, client.awin_affiliate_id)) {
        problems.push(`#${c.id} ${c.s.slug} (${c.s.network}): ${p} · ${mask(link.url).slice(0, 160)}`);
      }
    } else {
      row.hidden++;
      reasons.set(`${c.s.network}: ${link.message}`, (reasons.get(`${c.s.network}: ${link.message}`) ?? 0) + 1);
      hidden.push(`#${c.id} ${c.s.slug} (${c.s.network}, ${c.source}${c.verified ? "" : ", sin verificar"}): ${link.message}`);
    }
    byNet.set(c.s.network, row);
  }

  const total = [...byNet.values()].reduce((a, r) => ({ before: a.before + r.before, public: a.public + r.public, hidden: a.hidden + r.hidden }), { before: 0, public: 0, hidden: 0 });
  console.log(`Auditoría de tracking (solo lectura), ${today}. Cliente del sitio ${client.slug}${data.client ? "" : " (no existe: se usa su slug)"}, publicar sin verificar ${data.unverified ? "sí" : "no"}, migración de tracking ${data.migrated ? "aplicada" : "pendiente (npm run db:setup)"}.`);
  console.log(`Cuentas Awin nuestras: ${data.awinPublishers.size}.\n`);
  console.log("red            antes  públicos  ocultos");
  for (const [net, r] of [...byNet].sort((a, b) => b[1].before - a[1].before)) {
    console.log(`${net.padEnd(14)} ${String(r.before).padStart(5)}  ${String(r.public).padStart(8)}  ${String(r.hidden).padStart(7)}`);
  }
  console.log(`${"total".padEnd(14)} ${String(total.before).padStart(5)}  ${String(total.public).padStart(8)}  ${String(total.hidden).padStart(7)}\n`);

  console.log("Por qué se ocultan:");
  for (const [r, n] of [...reasons].sort((a, b) => b[1] - a[1])) console.log(`  ${n}  ${r}`);
  if (notes.size) {
    console.log("\nEnlaces públicos con el destino corregido:");
    const label: Record<string, string> = { "foreign-destination": "deep link a otro dominio, va a la portada de la tienda", "no-destination": "sin página propia, va a la portada", "https-upgraded": "destino http pasado a https" };
    for (const [n, ids] of notes) console.log(`  ${ids.length}  ${label[n] ?? n}: ${ids.map((i) => `#${i}`).join(", ")}`);
  }
  if (process.argv.includes("--hidden")) {
    console.log("\nCupones ocultos:");
    for (const h of hidden) console.log(`  ${h}`);
  }
  console.log(`\nProblemas en cupones públicos: ${problems.length}`);
  for (const p of problems) console.log(`  ${p}`);
  process.exitCode = problems.length ? 1 : 0;
} finally {
  await sql.end();
}
