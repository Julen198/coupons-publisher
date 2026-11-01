import { getUser } from "@/lib/auth";
import { IMPORT_COLUMNS } from "@/lib/coupon-import";
import { toCsv } from "@/lib/csv";
import { sql } from "@/lib/db";

// Admin-only CSV downloads. Fixed table → query map: the URL never reaches SQL.
const QUERIES = {
  clients: () => sql()`SELECT id, name, slug, domain, awin_affiliate_id, clickref_prefix, brand_color, logo_url, nav_items, font_style, font_family, layout, created_at FROM clients ORDER BY id`,
  stores: () => sql()`SELECT id, name, slug, website, network, merchant_id, tracking_url, intro, faqs, created_at FROM stores ORDER BY id`,
  coupons: () => sql()`
    SELECT c.id, s.slug AS tienda, c.title AS titulo, c.code AS codigo, c.discount AS descuento, c.description AS descripcion,
           c.target_url AS url, c.expires_at AS caduca, c.verified AS verificado, c.archived AS retirado, c.source AS origen, c.created_at
    FROM coupons c JOIN stores s ON s.id = c.store_id ORDER BY c.id`,
  pages: () => sql()`
    SELECT cl.slug AS cliente, s.slug AS tienda, p.status AS estado, p.delivery AS entrega, p.published_at AS publicada
    FROM pages p JOIN clients cl ON cl.id = p.client_id JOIN stores s ON s.id = p.store_id ORDER BY cl.slug, s.slug`,
  clicks: () => sql()`
    SELECT k.at AS fecha, cl.slug AS cliente, s.slug AS tienda, k.coupon_id AS cupon
    FROM clicks k JOIN clients cl ON cl.id = k.client_id JOIN stores s ON s.id = k.store_id ORDER BY k.at DESC`,
  "costes-ia": () => sql()`
    SELECT at AS fecha, feature AS funcion, about AS sobre, user_name AS usuario, input_tokens AS tokens_entrada, output_tokens AS tokens_salida,
           web_searches AS busquedas_web, cost_total AS coste_usd, cost_gateway AS cobrado_gateway_usd, ok, estimated AS estimado
    FROM ai_usage ORDER BY at DESC`,
} as const;

const csvResponse = (name: string, body: string) =>
  new Response("﻿" + body, { // BOM so Excel reads UTF-8 accents
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"`, "Cache-Control": "no-store" },
  });

export async function GET(_req: Request, ctx: RouteContext<"/api/export/[table]">) {
  const user = await getUser();
  if (!user || user.role !== "admin") return new Response("Solo administradores", { status: 403 });

  const { table } = await ctx.params;
  if (table === "coupon-template") {
    return csvResponse("plantilla-cupones", toCsv([...IMPORT_COLUMNS], [["adidas", "Cupón estudiantes", "STUDENT15", "15%", "Verificando tu condición de estudiante", "https://www.adidas.es", "31/12/2026", "sí"]]));
  }
  if (!(table in QUERIES)) return new Response("No encontrado", { status: 404 });

  const rows = await QUERIES[table as keyof typeof QUERIES]();
  const headers = rows.columns.map((c) => c.name);
  return csvResponse(`${table}-${new Date().toISOString().slice(0, 10)}`, toCsv(headers, rows.map((r) => headers.map((h) => r[h]))));
}
