import { listPages, listStores, type Client, type Coupon, type Store } from "./db";
import { publicPageHtml } from "./public-page.ts";
import { renderPage } from "./render-page.ts";
import { cleanFontFamily, validLogo } from "./disguise.ts";
import { renderDemo } from "./render-demo.ts";

const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });

// Demo page for a client (saved or a form preview), store picked by ?store=
export async function demoResponse(client: Client, req: Request, opts: { saved: boolean }): Promise<Response> {
  const [allStores, pages] = await Promise.all([listStores(), opts.saved ? listPages() : Promise.resolve([])]);
  // only the stores this client has pages for; unsaved previews and clients without pages get the sample store
  const mine = new Set(pages.filter((p) => p.client_id === client.id).map((p) => p.store_id));
  const stores = allStores.filter((s) => mine.has(s.id));
  if (!stores.length) {
    return html(
      renderDemo(client, [SAMPLE_STORE], SAMPLE_STORE, {
        moduleHtml: renderPage(client, SAMPLE_STORE, SAMPLE_COUPONS, new Date()),
        storeHref: () => "#",
      }),
    );
  }

  const url = new URL(req.url);
  const current = stores.find((s) => s.slug === url.searchParams.get("store")) ?? stores[0];
  const storeHref = (slug: string) => {
    const next = new URL(url);
    next.searchParams.set("store", slug);
    return next.pathname + next.search;
  };
  return html(
    renderDemo(client, stores, current, {
      moduleHtml: await publicPageHtml(client, current, url.origin),
      storeHref,
      moduleLink: opts.saved ? `/p/${client.slug}/${current.slug}` : undefined,
      bar: url.searchParams.get("embed") !== "1",
    }),
  );
}

// Builds an unsaved Client from query params, sanitising everything that ends up in HTML/CSS/hrefs.
export function previewClient(params: URLSearchParams): Client {
  const get = (k: string, max = 120) => (params.get(k) ?? "").trim().slice(0, max);
  const color = get("color");
  const logo = get("logo", 30_000); // embedded SVG logos are a few KB
  const awin = get("awin");
  return {
    id: 0,
    slug: "preview",
    name: get("name") || "Nombre del medio",
    domain: get("domain"),
    awin_affiliate_id: /^\d+$/.test(awin) ? awin : "",
    clickref_prefix: get("ref", 40),
    brand_color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#1d4ed8",
    logo_url: validLogo(logo) ? logo : "",
    nav_items: get("nav", 300),
    font_style: get("font") === "sans" ? "sans" : "serif",
    font_family: cleanFontFamily(get("ff", 40)) ?? "",
    layout: get("layout") === "store" ? "store" : "newspaper",
  };
}

// ponytail: fixed sample shown only while the panel has no stores; links go nowhere real
const SAMPLE_STORE: Store = {
  id: -1,
  name: "Tienda de ejemplo",
  slug: "ejemplo",
  website: "https://www.example.com",
  merchant_id: "",
  network: "awin",
  tracking_url: "",
  has_logo: false,
  intro: "Así se verán los cupones de cada tienda cuando la añadas al panel.",
  faqs: "¿Cómo uso un código descuento? | Cópialo y pégalo en el carrito antes de pagar.",
};

const sample = (id: number, kind: Coupon["kind"], discount: string, title: string, code = ""): Coupon => ({
  id, store_id: -1, kind, title, code, discount, description: "Cupón de ejemplo", target_url: "https://www.example.com",
  expires_at: "", verified: 1, archived: 0, source: "manual", source_url: "", external_id: null,
});

const SAMPLE_COUPONS: Coupon[] = [
  sample(-1, "code", "15%", "Código descuento de bienvenida", "HOLA15"),
  sample(-2, "deal", "50%", "Rebajas de temporada hasta -50%"),
  sample(-3, "code", "10€", "10€ en tu primera compra", "PRIMERA10"),
];
