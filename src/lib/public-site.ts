import { io } from "next/cache";
import { sql, type Client, type Coupon, type Store } from "./db";
import { isPublic, statusOf } from "./coupon-status.ts";
import { publishUnverified } from "./settings.ts";
import { couponAffiliateUrl } from "./render-page.ts";
import { getReader } from "./reader";
import { madridToday } from "./site-text.ts";
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
};

const COUPON_SELECT = `
  SELECT c.*, s.name AS store_name, s.slug AS store_slug, s.logo_data <> '' AS store_has_logo, s.category AS store_category, s.website AS store_website,
         s.network AS store_network, s.merchant_id AS store_merchant_id, s.tracking_url AS store_tracking_url,
         coalesce(s.publisher_id, '') AS store_publisher_id,
         coalesce(v.score, 0)::int AS score, coalesce(cm.n, 0)::int AS comments,
         CASE WHEN sb.status = 'active' THEN sb.handle END AS shared_by_handle
  FROM coupons c JOIN stores s ON s.id = c.store_id
  LEFT JOIN (SELECT vt.coupon_id, sum(vt.value) AS score FROM votes vt JOIN readers vr ON vr.id = vt.reader_id WHERE vr.status = 'active' GROUP BY vt.coupon_id) v ON v.coupon_id = c.id
  LEFT JOIN (
    SELECT k.coupon_id, count(*) AS n FROM comments k JOIN readers r ON r.id = k.reader_id
    WHERE k.hidden = 0 AND r.status = 'active' GROUP BY k.coupon_id
  ) cm ON cm.coupon_id = c.id
  LEFT JOIN readers sb ON sb.id = c.shared_by`;

const plain = <T>(rows: readonly T[]): T[] => rows.map((r) => ({ ...r }));

// Every live coupon readers may see (same rule as clients' pages), newest first
export async function siteCoupons(): Promise<SiteCoupon[]> {
  await io();
  const [rows, unverified] = await Promise.all([
    sql()<SiteCoupon[]>`${sql().unsafe(COUPON_SELECT)} WHERE c.archived = 0 ORDER BY c.verified DESC, c.id DESC`,
    publishUnverified(),
  ]);
  const t = madridToday().iso;
  return plain(rows).filter((c) => isPublic(c, t, unverified));
}

// One coupon for its own page: live ones, and expired ones too (shown as expired so the URL keeps working)
export async function siteCoupon(id: number): Promise<{ coupon: SiteCoupon; live: boolean } | undefined> {
  await io();
  const [[row], unverified] = await Promise.all([
    sql()<SiteCoupon[]>`${sql().unsafe(COUPON_SELECT)} WHERE c.id = ${id}`,
    publishUnverified(),
  ]);
  if (!row) return undefined;
  const coupon = { ...row };
  const t = madridToday().iso;
  if (isPublic(coupon, t, unverified)) return { coupon, live: true };
  // expired but once public: keep the page, marked as expired. Archived or never-checked web finds: gone.
  const wasPublic = statusOf(coupon, t) === "expired" && (unverified || coupon.source !== "web" || coupon.verified);
  return wasPublic ? { coupon, live: false } : undefined;
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

export async function siteStore(slug: string): Promise<Store | undefined> {
  await io();
  const [row] = await sql()<Store[]>`
    SELECT id, name, slug, website, network, merchant_id, tracking_url, publisher_id, intro, faqs, category, facts, logo_data <> '' AS has_logo
    FROM stores WHERE slug = ${slug}`;
  return row ? { ...row } : undefined;
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

export type DealComment = { id: number; handle: string; body: string; created_at: Date; by_sharer: boolean };

// Visible comments by active readers, oldest first
export async function dealComments(couponId: number): Promise<DealComment[]> {
  await io();
  const rows = await sql()<DealComment[]>`
    SELECT k.id, r.handle, k.body, k.created_at, (c.shared_by IS NOT NULL AND c.shared_by = k.reader_id) AS by_sharer
    FROM comments k
    JOIN readers r ON r.id = k.reader_id AND r.status = 'active' AND r.handle IS NOT NULL
    JOIN coupons c ON c.id = k.coupon_id
    WHERE k.coupon_id = ${couponId} AND k.hidden = 0
    ORDER BY k.created_at, k.id LIMIT 200`;
  return plain(rows);
}

// Every store, for the "share a deal" picker
export async function siteStoreOptions(): Promise<{ slug: string; name: string }[]> {
  await io();
  const rows = await sql()<{ slug: string; name: string }[]>`SELECT slug, name FROM stores ORDER BY lower(name)`;
  return rows.map((r) => ({ ...r }));
}
