import postgres from "postgres";
import { io } from "next/cache";

export type Client = {
  id: number;
  name: string;
  slug: string;
  domain: string;
  awin_affiliate_id: string;
  clickref_prefix: string;
  brand_color: string;
  logo_url: string;
  nav_items: string; // comma-separated menu sections for the demo
  font_style: "serif" | "sans";
  font_family: string; // their web font ("Montserrat"), "" = generic serif/sans stack
  layout: "newspaper" | "store";
};

export type Store = {
  id: number;
  name: string;
  slug: string;
  website: string;
  awin_merchant_id: string;
  network: string; // "awin" or another affiliate network (see NETWORKS)
  tracking_url: string; // non-Awin networks: their link with {url} and {ref} placeholders
  has_logo: boolean; // the icon itself (logo_data) stays out of lists: see /store-logo/<slug>
  intro: string;
  faqs: string; // one "Pregunta | Respuesta" per line
};

export type Coupon = {
  id: number;
  store_id: number;
  kind: "code" | "deal";
  title: string;
  code: string;
  discount: string;
  description: string;
  target_url: string;
  expires_at: string;
  verified: number;
  archived: number;
  source: "manual" | "awin" | "web"; // web = found by the coupon finder, hidden until verified
  source_url: string; // where a web find was seen, for whoever verifies it
  awin_offer_id: string | null;
};

export type CouponWithStore = Coupon & { store_name: string; store_slug: string; store_has_logo: boolean };

export type Delivery = "html" | "widget";

export type Page = {
  client_id: number;
  store_id: number;
  status: "draft" | "published";
  delivery: Delivery;
  published_at: Date | null;
};

export type PageWithNames = Page & { client_slug: string; client_name: string; store_slug: string; store_name: string };

// Lazy so `next build` doesn't need DATABASE_URL.
// Use Supabase's *session* pooler (port 5432): with the transaction pooler (6543) postgres.js hangs
// as soon as queries queue for a connection. idle_timeout hands idle connections back to the pooler.
// ponytail: session mode caps total connections (~15 on free); move to the transaction pooler with a driver that supports it if traffic grows
// The pool lives on globalThis so dev hot reloads reuse it instead of leaking a new one per reload
// (session mode allows only ~15 connections in total, shared with production).
const globalForDb = globalThis as typeof globalThis & { __cpSql?: postgres.Sql };
export function sql(): postgres.Sql {
  if (!globalForDb.__cpSql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL no está configurada");
    globalForDb.__cpSql = postgres(url, { prepare: false, max: 3, idle_timeout: 10 });
  }
  return globalForDb.__cpSql;
}

// Every read waits for a request (uncached data) — see Next's io() docs
async function q<T>(run: (s: postgres.Sql) => Promise<T>): Promise<T> {
  await io();
  return run(sql());
}

// postgres.js rows are RowList objects; spread to plain objects so they can cross into client components
const plain = <T>(rows: readonly T[]): T[] => rows.map((r) => ({ ...r }));

export const listClients = () => q(async (s) => plain(await s<Client[]>`SELECT * FROM clients ORDER BY name`));

export const getClient = (slug: string) =>
  q(async (s) => plain(await s<Client[]>`SELECT * FROM clients WHERE slug = ${slug}`)[0] as Client | undefined);

const STORE_COLS = "id, name, slug, website, network, awin_merchant_id, tracking_url, intro, faqs, logo_data <> '' AS has_logo";

export const listStores = () => q(async (s) => plain(await s<Store[]>`SELECT ${s.unsafe(STORE_COLS)} FROM stores ORDER BY lower(name)`));

export const getStore = (slug: string) =>
  q(async (s) => plain(await s<Store[]>`SELECT ${s.unsafe(STORE_COLS)} FROM stores WHERE slug = ${slug}`)[0] as Store | undefined);

export const listCoupons = (storeId: number) =>
  q(async (s) => plain(await s<Coupon[]>`SELECT * FROM coupons WHERE store_id = ${storeId} ORDER BY verified DESC, id`));

export const listAllCoupons = () =>
  q(async (s) =>
    plain(
      await s<CouponWithStore[]>`
        SELECT coupons.*, stores.name AS store_name, stores.slug AS store_slug, stores.logo_data <> '' AS store_has_logo
        FROM coupons JOIN stores ON stores.id = coupons.store_id
        ORDER BY lower(stores.name), coupons.verified DESC, coupons.id`,
    ),
  );

export const listPages = () =>
  q(async (s) =>
    plain(
      await s<PageWithNames[]>`
        SELECT pages.*, c.slug AS client_slug, c.name AS client_name, st.slug AS store_slug, st.name AS store_name
        FROM pages JOIN clients c ON c.id = pages.client_id JOIN stores st ON st.id = pages.store_id
        ORDER BY lower(c.name), lower(st.name)`,
    ),
  );

export const getPage = (clientId: number, storeId: number) =>
  q(async (s) => plain(await s<Page[]>`SELECT * FROM pages WHERE client_id = ${clientId} AND store_id = ${storeId}`)[0] as Page | undefined);

export const listActivity = (limit = 8) =>
  q(async (s) => plain(await s<{ id: number; at: Date; text: string }[]>`SELECT * FROM activity ORDER BY at DESC LIMIT ${limit}`));
