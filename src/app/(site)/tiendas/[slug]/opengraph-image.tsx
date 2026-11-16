import { ImageResponse } from "next/og";
import { sql } from "@/lib/db";
import { siteCoupons, siteStore } from "@/lib/public-site";
import { madridToday, siteUrl } from "@/lib/site-text";
import { storeH1 } from "@/lib/deal-text";

// The picture when a store page is shared (Telegram, WhatsApp, social): logo, name, how many coupons are live today
export const alt = "Códigos descuento en CuponLab";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const C = { bg: "#f3f5fa", surface: "#ffffff", line: "#d9dfeb", ink: "#141a2b", muted: "#5b647a", brand: "#1d4ed8", drop: "#c2410c", dropSoft: "#fdebdd" };

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const store = await siteStore((await params).slug);
  if (!store) return new Response("Tienda no encontrada", { status: 404 });
  const [[row], coupons] = await Promise.all([sql()<{ logo_data: string }[]>`SELECT logo_data FROM stores WHERE id = ${store.id}`, siteCoupons()]);
  const mine = coupons.filter((c) => c.store_id === store.id);
  const logo = /^data:image\//.test(row?.logo_data ?? "") ? row.logo_data : "";
  const heading = storeH1(store.name, mine, new Date(`${madridToday().iso}T12:00:00Z`), store.title_term);
  const count = mine.length === 0 ? "Sin cupones activos hoy" : mine.length === 1 ? "1 cupón activo hoy" : `${mine.length} cupones activos hoy`;
  const host = new URL(siteUrl()).host;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: C.bg, padding: 48, fontFamily: "sans-serif" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", background: C.surface, border: `2px solid ${C.line}`, borderRadius: 24, padding: 56 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
            <div style={{ width: 140, height: 140, display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${C.line}`, borderRadius: 20, background: "#fff", overflow: "hidden" }}>
              {logo ? (
                <img src={logo} alt="" width={112} height={112} style={{ objectFit: "contain" }} />
              ) : (
                <span style={{ fontSize: 64, fontWeight: 700, color: C.brand }}>{store.name.slice(0, 1).toUpperCase()}</span>
              )}
            </div>
            <span style={{ fontSize: 48, fontWeight: 700, color: C.ink }}>{store.name}</span>
          </div>
          <span style={{ fontSize: 60, fontWeight: 800, lineHeight: 1.1, color: C.ink }}>{heading}</span>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 28, color: C.muted }}>
            <span style={{ fontWeight: 700, color: C.drop, background: C.dropSoft, borderRadius: 12, padding: "6px 18px" }}>{count}</span>
            <span><span style={{ fontWeight: 700, color: C.brand }}>CuponLab</span>&nbsp;· {host}</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
