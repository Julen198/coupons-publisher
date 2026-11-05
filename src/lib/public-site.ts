import { io } from "next/cache";
import { sql, type Client, type Coupon, type Store } from "./db";
import { isPublic, statusOf } from "./coupon-status.ts";
import { publishUnverified } from "./settings.ts";
import { couponAffiliateUrl } from "./render-page.ts";
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
};

const COUPON_SELECT = `
  SELECT c.*, s.name AS store_name, s.slug AS store_slug, s.logo_data <> '' AS store_has_logo, s.category AS store_category, s.website AS store_website,
         s.network AS store_network, s.merchant_id AS store_merchant_id, s.tracking_url AS store_tracking_url,
         coalesce(s.publisher_id, '') AS store_publisher_id
  FROM coupons c JOIN stores s ON s.id = c.store_id`;

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

export async function siteStore(slug: string): Promise<Store | undefined> {
  await io();
  const [row] = await sql()<Store[]>`
    SELECT id, name, slug, website, network, merchant_id, tracking_url, publisher_id, intro, faqs, logo_data <> '' AS has_logo
    FROM stores WHERE slug = ${slug}`;
  return row ? { ...row } : undefined;
}

export async function siteStoreById(id: number): Promise<Pick<Store, "intro" | "faqs"> | undefined> {
  await io();
  const [row] = await sql()<Pick<Store, "intro" | "faqs">[]>`SELECT intro, faqs FROM stores WHERE id = ${id}`;
  return row ? { ...row } : undefined;
}

// Store intros for the "know before you use a code" guides
export async function storeGuides(storeIds: number[]): Promise<Pick<Store, "id" | "name" | "slug" | "intro">[]> {
  if (!storeIds.length) return [];
  await io();
  const rows = await sql()<Pick<Store, "id" | "name" | "slug" | "intro">[]>`
    SELECT id, name, slug, intro FROM stores WHERE id = ANY(${storeIds}) AND intro <> ''`;
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
