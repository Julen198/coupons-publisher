import { io } from "next/cache";
import { sql, type Client, type Coupon, type Store } from "./db";
import { isPublic } from "./coupon-status.ts";
import { dealVisibility } from "./site-routes.ts";
import { publishUnverified } from "./settings.ts";
import { couponAffiliateUrl } from "./render-page.ts";
import { getReader } from "./reader";
import { madridToday } from "./site-text.ts";
import { BRAND_ALLOWLIST, dedupeDeals, displayTitle } from "./deal-text.ts";
import { isSpanishMarket } from "./market.ts";
import type { CategorySlug } from "./catalog.ts";

// A coupon with what the public site needs from its store
export type SiteCoupon = Coupon & {
  created_at: Date;
  store_name: string;
  store_slug: string;
  store_has_logo: boolean;
  store_category: CategorySlug | "";
  store_website: string;
  store_network: string;
  store_merchant_id: string;
  store_tracking_url: string;
  store_publisher_id: string;
  score: number;
  comments: number;
  shared_by_handle: string | null;
  expiry_reports: number; // readers who marked it as expired ("Marcar como caducado")
  image_url: string; // product image (https) from a network feed or the landing page's og:image, "" = show the store logo
  display_title: string; // the title as the site shows it (displayTitle with the known brands)
};

const COUPON_SELECT = `
  SELECT c.*, s.name AS store_name, s.slug AS store_slug, s.logo_data <> '' AS store_has_logo, s.category AS store_category, s.website AS store_website,
         s.network AS store_network, s.merchant_id AS store_merchant_id, s.tracking_url AS store_tracking_url,
         coalesce(s.publisher_id, '') AS store_publisher_id,
         coalesce(v.score, 0)::int AS score, coalesce(cm.n, 0)::int AS comments,
         CASE WHEN sb.status = 'active' THEN sb.handle END AS shared_by_handle, coalesce(er.n, 0)::int AS expiry_reports
  FROM coupons c JOIN stores s ON s.id = c.store_id
  LEFT JOIN (SELECT vt.coupon_id, sum(vt.value) AS score FROM votes vt JOIN readers vr ON vr.id = vt.reader_id WHERE vr.status = 'active' GROUP BY vt.coupon_id) v ON v.coupon_id = c.id
  LEFT JOIN (
    SELECT k.coupon_id, count(*) AS n FROM comments k JOIN readers r ON r.id = k.reader_id
    LEFT JOIN comments pk ON pk.id = k.parent_id LEFT JOIN readers pr ON pr.id = pk.reader_id
    WHERE k.hidden = 0 AND r.status = 'active' AND (k.parent_id IS NULL OR (pk.hidden = 0 AND pr.status = 'active'))
    GROUP BY k.coupon_id
  ) cm ON cm.coupon_id = c.id
  LEFT JOIN readers sb ON sb.id = c.shared_by
  LEFT JOIN (SELECT e.coupon_id, count(*) AS n FROM expiry_reports e JOIN readers er_r ON er_r.id = e.reader_id WHERE er_r.status = 'active' GROUP BY e.coupon_id) er ON er.coupon_id = c.id`;

const plain = <T>(rows: readonly T[]): T[] => rows.map((r) => ({ ...r }));

// Store names plus BRAND_ALLOWLIST: words a shouting feed title gives back their own case ("NIKE" → "Nike")
async function knownBrands(): Promise<string[]> {
  const rows = await sql()<{ name: string }[]>`SELECT name FROM stores`;
  return [...BRAND_ALLOWLIST, ...rows.map((r) => r.name)];
}

// Plain copies with display_title filled in
function titled<T extends { title: string; store_name: string }>(rows: readonly T[], brands: readonly string[]): (T & { display_title: string })[] {
  return rows.map((r) => ({ ...r, display_title: displayTitle(r.title, r.store_name, brands) }));
}

// Every live coupon readers may see (same rule as clients' pages), newest first. Stores of other European
// markets stay out (the site is Spanish), and a deal listed twice by its store shows once.
export async function siteCoupons(): Promise<SiteCoupon[]> {
  await io();
  const [rows, unverified, brands] = await Promise.all([
    sql()<SiteCoupon[]>`${sql().unsafe(COUPON_SELECT)} WHERE c.archived = 0 ORDER BY c.verified DESC, c.id DESC`,
    publishUnverified(),
    knownBrands(),
  ]);
  const t = madridToday().iso;
  return dedupeDeals(titled(rows, brands).filter((c) => isPublic(c, t, unverified) && isSpanishMarket(c.store_website)));
}

// One coupon for its own page: live ones, and expired ones too (shown as expired so the URL keeps working)
export async function siteCoupon(id: number): Promise<{ coupon: SiteCoupon; live: boolean } | undefined> {
  await io();
  const [[row], unverified, brands] = await Promise.all([
    sql()<SiteCoupon[]>`${sql().unsafe(COUPON_SELECT)} WHERE c.id = ${id}`,
    publishUnverified(),
    knownBrands(),
  ]);
  if (!row) return undefined;
  const [coupon] = titled([row], brands);
  const seen = dealVisibility(coupon, madridToday().iso, unverified);
  return seen === "gone" ? undefined : { coupon, live: seen === "live" };
}

// What a reader has voted, by coupon id
export async function readerVotes(readerId: number): Promise<Map<number, -1 | 1>> {
  await io();
  const rows = await sql()<{ coupon_id: number; value: number }[]>`SELECT coupon_id, value FROM votes WHERE reader_id = ${readerId}`;
  return new Map(rows.map((r) => [r.coupon_id, r.value === 1 ? 1 : -1]));
}

// The signed-in reader's votes, or none. One query per request.
export async function currentVotes(): Promise<Map<number, -1 | 1>> {
  const reader = await getReader();
  return reader ? readerVotes(reader.id) : new Map();
}

// What the signed-in reader did on one deal: saved it (Guardar), reported it as expired (Marcar como caducado)
export async function readerDealMarks(readerId: number | null, couponId: number): Promise<{ saved: boolean; reported: boolean }> {
  if (!readerId) return { saved: false, reported: false };
  await io();
  const [row] = await sql()<{ saved: boolean; reported: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM saved_deals WHERE reader_id = ${readerId} AND coupon_id = ${couponId}) AS saved,
           EXISTS (SELECT 1 FROM expiry_reports WHERE reader_id = ${readerId} AND coupon_id = ${couponId}) AS reported`;
  return { saved: !!row?.saved, reported: !!row?.reported };
}

export async function siteStore(slug: string): Promise<Store | undefined> {
  await io();
  const [row] = await sql()<Store[]>`
    SELECT id, name, slug, website, network, merchant_id, tracking_url, publisher_id, intro, faqs, category, facts, logo_data <> '' AS has_logo
    FROM stores WHERE slug = ${slug}`;
  return row && isSpanishMarket(row.website) ? { ...row } : undefined;
}

export async function siteStoreById(id: number): Promise<Pick<Store, "intro" | "faqs" | "category" | "facts"> | undefined> {
  await io();
  const [row] = await sql()<Pick<Store, "intro" | "faqs" | "category" | "facts">[]>`SELECT intro, faqs, category, facts FROM stores WHERE id = ${id}`;
  return row ? { ...row } : undefined;
}

// Store intros for the "know before you use a code" guides
export async function storeGuides(storeIds: number[]): Promise<Pick<Store, "id" | "name" | "slug" | "intro" | "facts">[]> {
  if (!storeIds.length) return [];
  await io();
  const rows = await sql()<Pick<Store, "id" | "name" | "slug" | "intro" | "facts">[]>`
    SELECT id, name, slug, intro, facts FROM stores WHERE id = ANY(${storeIds}) AND (intro <> '' OR facts <> '')`;
  return plain(rows);
}

// The client whose clicks the public site counts as (create it in Clientes with this slug)
export const SITE_CLIENT_SLUG = process.env.SITE_CLIENT_SLUG || "cuponlab";

export async function siteClient(): Promise<Client | undefined> {
  await io();
  const [row] = await sql()<Client[]>`SELECT * FROM clients WHERE slug = ${SITE_CLIENT_SLUG}`;
  return row ? { ...row } : undefined;
}

// Where "Ir a la tienda" goes: through /go (counted) when the site client exists, else straight to the
// affiliate link with our own publisher ids
export function goHref(client: Client | undefined, c: SiteCoupon): string {
  if (client) return `/go/${encodeURIComponent(client.slug)}/${c.id}`;
  const ours = { clickref_prefix: SITE_CLIENT_SLUG, awin_affiliate_id: "" } as Client;
  const store = { slug: c.store_slug, network: c.store_network, merchant_id: c.store_merchant_id, tracking_url: c.store_tracking_url, publisher_id: c.store_publisher_id };
  return couponAffiliateUrl(ours, store, c);
}

export type DealComment = {
  id: number; parent_id: number | null; reader_id: number; handle: string; body: string; created_at: Date; by_sharer: boolean;
  helpful: number; mine: boolean;
};

// Visible comments and replies by active readers (a reply goes when its parent is hidden), oldest first;
// `mine` says whether the signed-in reader marked it as useful
export async function dealComments(couponId: number, readerId: number | null): Promise<DealComment[]> {
  await io();
  const rows = await sql()<DealComment[]>`
    SELECT k.id, k.parent_id, k.reader_id, r.handle, k.body, k.created_at, (c.shared_by IS NOT NULL AND c.shared_by = k.reader_id) AS by_sharer,
           (SELECT count(*) FROM comment_votes cv JOIN readers vr ON vr.id = cv.reader_id AND vr.status = 'active' WHERE cv.comment_id = k.id)::int AS helpful,
           EXISTS (SELECT 1 FROM comment_votes cv WHERE cv.comment_id = k.id AND cv.reader_id = ${readerId}) AS mine
    FROM comments k
    JOIN readers r ON r.id = k.reader_id AND r.status = 'active' AND r.handle IS NOT NULL
    JOIN coupons c ON c.id = k.coupon_id
    LEFT JOIN comments pk ON pk.id = k.parent_id
    LEFT JOIN readers pr ON pr.id = pk.reader_id
    WHERE k.coupon_id = ${couponId} AND k.hidden = 0 AND (k.parent_id IS NULL OR (pk.hidden = 0 AND pr.status = 'active'))
    ORDER BY k.created_at, k.id LIMIT 200`;
  return plain(rows);
}

// Every store of the Spanish market, for the "share a deal" picker
export async function siteStoreOptions(): Promise<{ slug: string; name: string }[]> {
  await io();
  const rows = await sql()<{ slug: string; name: string; website: string }[]>`SELECT slug, name, website FROM stores ORDER BY lower(name)`;
  return rows.filter((r) => isSpanishMarket(r.website)).map((r) => ({ slug: r.slug, name: r.name }));
}

// ---- the reader's account page (/cuenta)

export type AccountStats = { shared: number; votes: number; comments: number };

// Deals they shared (any state), the score of those deals from active readers, their visible comments
export async function readerStats(readerId: number): Promise<AccountStats> {
  await io();
  const [row] = await sql()<AccountStats[]>`
    SELECT (SELECT count(*) FROM coupons WHERE shared_by = ${readerId})::int AS shared,
           (SELECT coalesce(sum(v.value), 0) FROM votes v JOIN coupons c ON c.id = v.coupon_id JOIN readers vr ON vr.id = v.reader_id
            WHERE c.shared_by = ${readerId} AND vr.status = 'active')::int AS votes,
           (SELECT count(*) FROM comments WHERE reader_id = ${readerId} AND hidden = 0)::int AS comments`;
  return { ...row };
}

// A coupon on the account page; `page` = it has a public page to link to
export type AccountCoupon = SiteCoupon & { live: boolean; page: boolean };

async function withVisibility(rows: readonly SiteCoupon[]): Promise<AccountCoupon[]> {
  const [unverified, brands] = await Promise.all([publishUnverified(), knownBrands()]);
  const t = madridToday().iso;
  return titled(rows, brands).map((c) => {
    const seen = dealVisibility(c, t, unverified);
    return { ...c, live: seen === "live", page: seen !== "gone" };
  });
}

export async function readerSharedDeals(readerId: number): Promise<AccountCoupon[]> {
  await io();
  return withVisibility(await sql()<SiteCoupon[]>`${sql().unsafe(COUPON_SELECT)} WHERE c.shared_by = ${readerId} ORDER BY c.id DESC LIMIT 100`);
}

// Newest saved first (the page then lifts live ones to the top)
export async function readerSavedDeals(readerId: number): Promise<AccountCoupon[]> {
  await io();
  return withVisibility(await sql()<SiteCoupon[]>`
    ${sql().unsafe(COUPON_SELECT)} JOIN saved_deals sd ON sd.coupon_id = c.id AND sd.reader_id = ${readerId}
    ORDER BY sd.at DESC, c.id DESC LIMIT 200`);
}

export type AccountComment = { id: number; body: string; created_at: Date; coupon_id: number; title: string; store_name: string };

export async function readerComments(readerId: number): Promise<AccountComment[]> {
  await io();
  return plain(await sql()<AccountComment[]>`
    SELECT k.id, k.body, k.created_at, c.id AS coupon_id, c.title, s.name AS store_name
    FROM comments k JOIN coupons c ON c.id = k.coupon_id JOIN stores s ON s.id = c.store_id
    WHERE k.reader_id = ${readerId} AND k.hidden = 0
    ORDER BY k.created_at DESC, k.id DESC LIMIT 50`);
}
