import { ImageResponse } from "next/og";
import { siteUrl } from "@/lib/site-text";

// The picture shown when a page without one of its own (home, categories, calendar…) is shared: the same card as the
// event pages', with a heading and a line under it
export const SHARE_SIZE = { width: 1200, height: 630 };

const C = { bg: "#f3f5fa", surface: "#ffffff", line: "#d9dfeb", ink: "#141a2b", muted: "#5b647a", brand: "#1d4ed8", ok: "#13733a", okSoft: "#e1f3e6" };

export function shareCard(heading: string, line: string): ImageResponse {
  const host = new URL(siteUrl()).host;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: C.bg, padding: 48, fontFamily: "sans-serif" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", background: C.surface, border: `2px solid ${C.line}`, borderRadius: 24, padding: 56 }}>
          <span style={{ fontSize: 30, color: C.muted }}>Chollos y códigos descuento</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <span style={{ fontSize: 84, fontWeight: 800, lineHeight: 1.05, color: C.ink }}>{heading}</span>
            <span style={{ fontSize: 36, color: C.muted }}>{line}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 28, color: C.muted }}>
            <span style={{ fontSize: 32, fontWeight: 800, color: C.ok, background: C.okSoft, borderRadius: 14, padding: "8px 24px" }}>Con fecha de caducidad</span>
            <span><span style={{ fontWeight: 700, color: C.brand }}>CuponLab</span>&nbsp;· {host}</span>
          </div>
        </div>
      </div>
    ),
    SHARE_SIZE,
  );
}
