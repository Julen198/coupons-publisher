"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql, type Client, type Coupon, type Store } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { faqsToText, generateStoreContent } from "@/lib/ai-content";
import { errorMessage, required, str } from "@/lib/form";
import { DELIVERY_LABEL } from "@/lib/page-status";
import { canSeeClient, requireEditor } from "@/lib/auth";
import { siteCoupons } from "@/lib/public-site";
import { bulkTargets, nextStatus, stateOf, STATE_LABEL, type PageStatus, type StoreAction } from "@/lib/store-states";

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

// Generator form: save as draft or publish, with the chosen delivery method
export async function savePage(f: FormData) {
  const { client, store } = await pair(f);
  const delivery = DELIVERIES.find((d) => d === str(f, "delivery")) ?? "widget";
  const publish = str(f, "intent") === "publish";
  if ((await storePageStatus(client.id, store.id)) === "blocked") throw new Error("Esta tienda está bloqueada para este cliente: desbloquéala en su ficha");
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
  redirect(`/panel/clients/${client.slug}`);
}

// ---------- Tiendas of a client: Activa / Inactiva / Bloqueada ----------

const STORE_ACTIONS: StoreAction[] = ["activate", "deactivate", "block", "unblock"];

async function storePageStatus(clientId: number, storeId: number): Promise<PageStatus | undefined> {
  const [row] = await sql()<{ status: PageStatus }[]>`SELECT status FROM pages WHERE client_id = ${clientId} AND store_id = ${storeId}`;
  return row?.status;
}

async function writeStatus(clientId: number, storeId: number, status: PageStatus) {
  await sql()`
    INSERT INTO pages (client_id, store_id, status, published_at)
    VALUES (${clientId}, ${storeId}, ${status}, ${status === "published" ? sql()`now()` : null})
    ON CONFLICT (client_id, store_id) DO UPDATE SET status = EXCLUDED.status,
      published_at = CASE WHEN EXCLUDED.status = 'published' THEN coalesce(pages.published_at, now()) ELSE NULL END`;
}

// One button on a store row of the client's Tiendas list
export async function setStoreState(f: FormData) {
  const { client, store } = await pair(f);
  const action = STORE_ACTIONS.find((a) => a === str(f, "action"));
  if (!action) throw new Error("Acción no válida");
  const status = nextStatus(stateOf(await storePageStatus(client.id, store.id)), action);
  if (!status) throw new Error(action === "activate" ? "Está bloqueada: desbloquéala primero" : "Esa acción no aplica a esta tienda");
  await writeStatus(client.id, store.id, status);
  await logActivity(`${store.name} en ${client.name}: ${STATE_LABEL[stateOf(status)]}`);
  revalidatePath(`/panel/clients/${client.slug}`);
}

// «Activar todas» (new and inactive stores with live coupons, never blocked ones) / «Desactivar todas» / «Marcar nuevas
// como revisadas» (they stay off)
export async function bulkStoreState(f: FormData) {
  const user = await requireEditor();
  const [client] = await sql()<Client[]>`SELECT * FROM clients WHERE slug = ${required(f, "client")}`;
  if (!client || !canSeeClient(user, client.id)) throw new Error("No tienes acceso a este cliente");
  const action = (["activate", "deactivate", "review"] as const).find((a) => a === str(f, "action"));
  if (!action) throw new Error("Acción no válida");
  const [stores, pages, live] = await Promise.all([
    sql()<{ id: number; slug: string }[]>`SELECT id, slug FROM stores`,
    sql()<{ store_id: number; status: PageStatus }[]>`SELECT store_id, status FROM pages WHERE client_id = ${client.id}`,
    siteCoupons(),
  ]);
  const statusOf = new Map(pages.map((p) => [p.store_id, p.status]));
  const liveOf = live.reduce((m, c) => m.set(c.store_id, (m.get(c.store_id) ?? 0) + 1), new Map<number, number>());
  const rows = stores.map((s) => ({ storeId: s.id, slug: s.slug, state: stateOf(statusOf.get(s.id)), live: liveOf.get(s.id) ?? 0 }));
  const targets = bulkTargets(rows, action);
  for (const t of targets) await writeStatus(client.id, t.storeId, action === "activate" ? "published" : "draft");
  await logActivity(`${client.name}: ${targets.length} tiendas ${action === "activate" ? "activadas" : action === "deactivate" ? "desactivadas" : "marcadas como revisadas"} de golpe`);
  revalidatePath(`/panel/clients/${client.slug}`);
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
