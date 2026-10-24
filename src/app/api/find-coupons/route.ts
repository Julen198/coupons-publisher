import { getUser, canEdit } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { findCouponsOnline } from "@/lib/ai-content";
import { cleanFoundCoupons } from "@/lib/coupon-finder";
import { today } from "@/lib/coupon-status";
import { sql, type Store } from "@/lib/db";
import { searchBlocked } from "@/lib/ai-budget";

// One store per request so the panel can run several in parallel and show progress
// (server actions from one page run one at a time).
export async function POST(req: Request) {
  const user = await getUser();
  if (!user || !canEdit(user)) return Response.json({ error: "Sin permiso" }, { status: 403 });
  const { storeId } = (await req.json().catch(() => ({}))) as { storeId?: unknown };
  if (!Number.isInteger(storeId)) return Response.json({ error: "Falta la tienda" }, { status: 400 });
  const [store] = await sql()<Store[]>`SELECT * FROM stores WHERE id = ${storeId as number}`;
  if (!store) return Response.json({ error: "Tienda no encontrada" }, { status: 404 });
  if (await searchBlocked()) {
    return Response.json({ error: "Presupuesto de IA del mes superado: la búsqueda está parada (Costes de IA)", blocked: true }, { status: 402 });
  }

  try {
    const t = today();
    const existing = await sql()<{ title: string; code: string }[]>`SELECT title, code FROM coupons WHERE store_id = ${store.id}`;
    const drafts = cleanFoundCoupons(await findCouponsOnline(store, t), t, [...existing]);
    for (const c of drafts) {
      await sql()`
        INSERT INTO coupons (store_id, kind, title, code, discount, description, target_url, expires_at, verified, source, source_url)
        VALUES (${store.id}, ${c.kind}, ${c.title}, ${c.code}, ${c.discount}, ${c.description}, ${store.website}, ${c.expires_at}, 0, 'web', ${c.source_url})`;
    }
    if (drafts.length) await logActivity(`${drafts.length} cupón(es) de ${store.name} encontrados en internet, por revisar`);
    return Response.json({ added: drafts.length });
  } catch (e) {
    console.error("find-coupons failed", store.slug, e);
    return Response.json({ error: "No se pudo buscar" }, { status: 502 });
  }
}
