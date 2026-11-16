import { ImageResponse } from "next/og";
import { eventEdition, eventPageOf } from "@/lib/event-pages";
import { daysBetween, longDate, madridToday, siteUrl } from "@/lib/site-text";

// The picture when an event page is shared: the event, this year's date and the countdown
export const alt = "Ofertas en CuponLab";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const C = { bg: "#f3f5fa", surface: "#ffffff", line: "#d9dfeb", ink: "#141a2b", muted: "#5b647a", brand: "#1d4ed8", drop: "#c2410c", dropSoft: "#fdebdd" };

export default async function Image({ params }: { params: Promise<{ evento: string }> }) {
  const e = eventPageOf((await params).evento);
  if (!e) return new Response("Página no encontrada", { status: 404 });
  const today = madridToday().iso;
  const { year, date } = eventEdition(e, today);
  const left = daysBetween(today, date);
  const badge = left > 1 ? `Faltan ${left} días` : left === 1 ? "Es mañana" : left === 0 ? "Es hoy" : "Ofertas activas";
  const host = new URL(siteUrl()).host;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: C.bg, padding: 48, fontFamily: "sans-serif" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", background: C.surface, border: `2px solid ${C.line}`, borderRadius: 24, padding: 56 }}>
          <span style={{ fontSize: 30, color: C.muted }}>Chollos y códigos descuento</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <span style={{ fontSize: 88, fontWeight: 800, lineHeight: 1.05, color: C.ink }}>Ofertas {e.name} {year}</span>
            <span style={{ fontSize: 36, color: C.muted }}>{longDate(date)}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 28, color: C.muted }}>
            <span style={{ fontSize: 36, fontWeight: 800, color: C.drop, background: C.dropSoft, borderRadius: 14, padding: "8px 24px" }}>{badge}</span>
            <span><span style={{ fontWeight: 700, color: C.brand }}>CuponLab</span>&nbsp;· {host}</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
