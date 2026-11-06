import { ImageResponse } from "next/og";
import { sql } from "@/lib/db";
import { discountBadge } from "@/lib/discount";
import { siteCoupon } from "@/lib/public-site";
import { parseDealId, siteUrl } from "@/lib/site-text";

// The big picture under each Telegram post and in WhatsApp / social shares: store logo, discount, title
export const alt = "Chollo en CuponLab";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const C = { bg: "#f3f5fa", surface: "#ffffff", line: "#d9dfeb", ink: "#141a2b", muted: "#5b647a", brand: "#1d4ed8", drop: "#c2410c", dropSoft: "#fdebdd" };

export default async function Image({ params }: { params: Promise<{ deal: string }> }) {
  const id = parseDealId((await params).deal);
  const found = id ? await siteCoupon(id) : undefined;
  if (!found) return new Response("Chollo no encontrado", { status: 404 });
  const c = found.coupon;
  const [store] = await sql()<{ logo_data: string }[]>`SELECT logo_data FROM stores WHERE id = ${c.store_id}`;
  const logo = /^data:image\//.test(store?.logo_data ?? "") ? store.logo_data : "";
  const badge = discountBadge(c.discount) || (c.kind === "code" ? "Código" : "Oferta");
  const title = c.title.length > 90 ? `${c.title.slice(0, 88)}…` : c.title;
  const host = new URL(siteUrl()).host;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: C.bg, padding: 48, fontFamily: "sans-serif" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", background: C.surface, border: `2px solid ${C.line}`, borderRadius: 24, padding: 56 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
            <div style={{ width: 120, height: 120, display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${C.line}`, borderRadius: 20, background: "#fff", overflow: "hidden" }}>
              {logo ? (
                <img src={logo} alt="" width={96} height={96} style={{ objectFit: "contain" }} />
              ) : (
                <span style={{ fontSize: 56, fontWeight: 700, color: C.brand }}>{c.store_name.slice(0, 1).toUpperCase()}</span>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 40, fontWeight: 700, color: C.ink }}>{c.store_name}</span>
              <span style={{ fontSize: 26, color: C.muted }}>{c.kind === "code" ? "Código descuento" : "Oferta"}</span>
            </div>
            <span style={{ marginLeft: "auto", fontSize: 64, fontWeight: 800, color: C.drop, background: C.dropSoft, borderRadius: 16, padding: "8px 28px" }}>{badge}</span>
          </div>
          <span style={{ fontSize: 52, fontWeight: 700, lineHeight: 1.15, color: C.ink }}>{title}</span>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 28, color: C.muted }}>
            <span style={{ fontWeight: 700, color: C.brand }}>CuponLab</span>
            <span>{host}</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
