"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql, type Client, type Coupon, type Store } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { fetchOffers } from "@/lib/awin-demo";
import { faqsToText, generateStoreContent } from "@/lib/ai-content";
import { errorMessage, required, str } from "@/lib/form";
import { DELIVERY_LABEL } from "@/lib/page-status";
import { canSeeClient, requireEditor } from "@/lib/auth";

// Access control: the proxy only checks the cookie signature; every action below re-checks the user and role.

const DELIVERIES = ["widget", "html"] as const;

// The client × store a page action targets, after checking the user may edit that client
async function pair(f: FormData) {
  const user = await requireEditor();
  const [client] = await sql()<Client[]>`SELECT * FROM clients WHERE slug = ${required(f, "client")}`;
  const [store] = await sql()<Store[]>`SELECT * FROM stores WHERE slug = ${required(f, "store")}`;
  if (!client || !store) throw new Error("Cliente o tienda no encontrados");
  if (!canSeeClient(user, client.id)) throw new Error("No tienes acceso a este cliente");
  return { client, store };
}

// "Añadir tienda" on a client: creates the draft page and opens the generator
export async function addPage(f: FormData) {
  const { client, store } = await pair(f);
  await sql()`INSERT INTO pages (client_id, store_id) VALUES (${client.id}, ${store.id}) ON CONFLICT DO NOTHING`;
  // ?nueva: the generator writes the store's FAQs on arrival if it has none yet
  redirect(`/pages/${client.slug}/${store.slug}?nueva=1&desde=cliente`);
}

// Generator form: save as draft or publish, with the chosen delivery method
export async function savePage(f: FormData) {
  const { client, store } = await pair(f);
  const delivery = DELIVERIES.find((d) => d === str(f, "delivery")) ?? "widget";
  const publish = str(f, "intent") === "publish";
  await sql()`
    INSERT INTO pages (client_id, store_id, status, delivery, published_at)
    VALUES (${client.id}, ${store.id}, ${publish ? "published" : "draft"}, ${delivery}, ${publish ? sql()`now()` : null})
    ON CONFLICT (client_id, store_id) DO UPDATE SET
      status = EXCLUDED.status, delivery = EXCLUDED.delivery,
      published_at = CASE WHEN EXCLUDED.status = 'published' THEN now() ELSE NULL END`;
  if (publish) await logActivity(`Página ${store.name} publicada para ${client.name} (${DELIVERY_LABEL[delivery]})`);
  revalidatePath("/", "layout");
}

export async function removePage(f: FormData) {
  const { client, store } = await pair(f);
  await sql()`DELETE FROM pages WHERE client_id = ${client.id} AND store_id = ${store.id}`;
  await logActivity(`Página ${store.name} retirada de ${client.name}`);
  redirect(`/clients/${client.slug}`);
}

// ---------- Awin (demo catalogue) ----------

export async function importAwinOffers(f: FormData) {
  await requireEditor();
  const [store] = await sql()<Store[]>`SELECT * FROM stores WHERE slug = ${required(f, "store")}`;
  if (!store?.awin_merchant_id) throw new Error("La tienda no tiene merchant ID de Awin");
  const wanted = new Set(f.getAll("offers").map(String));
  const offers = fetchOffers(store.awin_merchant_id).filter((o) => wanted.has(o.id));
  if (!offers.length) return;
  const rows = offers.map((o) => ({
    store_id: store.id, kind: o.kind, title: o.title, code: o.code, discount: o.discount, description: o.description,
    target_url: o.url, expires_at: o.expires, verified: 1, source: "awin", awin_offer_id: o.id,
  }));
  const inserted = await sql()`INSERT INTO coupons ${sql()(rows)} ON CONFLICT (awin_offer_id) DO NOTHING RETURNING id`;
  await logActivity(`${inserted.length} oferta(s) de Awin importadas en ${store.name}`);
  revalidatePath("/", "layout");
}

// ---------- AI content ----------

// From the page generator: write the store's FAQs (and the intro if it has none) straight away.
// FAQs belong to the store, so every client publishing it gets them.
export async function generateStoreFaqs(storeSlug: string): Promise<{ count?: number; error?: string }> {
  const out = await generateContent(storeSlug);
  if (out.error || !out.faqs) return { error: out.error ?? "La IA no devolvió preguntas" };
  try {
    await sql()`
      UPDATE stores SET faqs = ${out.faqs}, intro = CASE WHEN intro = '' THEN ${out.intro ?? ""} ELSE intro END
      WHERE slug = ${storeSlug}`;
  } catch (e) {
    return { error: errorMessage(e) };
  }
  await logActivity(`FAQs generadas con IA para ${storeSlug}`);
  revalidatePath("/", "layout");
  return { count: out.faqs.split("\n").filter(Boolean).length };
}

export async function generateContent(storeSlug: string): Promise<{ intro?: string; faqs?: string; error?: string }> {
  try {
    await requireEditor();
    const [store] = await sql()<Store[]>`SELECT * FROM stores WHERE slug = ${storeSlug}`;
    if (!store) throw new Error("Tienda no encontrada");
    const coupons = await sql()<Coupon[]>`SELECT * FROM coupons WHERE store_id = ${store.id}`;
    const out = await generateStoreContent(store, [...coupons]);
    return { intro: out.intro, faqs: faqsToText(out.faqs) };
  } catch (e) {
    console.error("generateContent failed", e);
    return { error: `No se pudo generar el contenido: ${errorMessage(e)}` };
  }
}
