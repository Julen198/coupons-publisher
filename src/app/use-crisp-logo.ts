"use client";

import { useRef, useState, type CSSProperties } from "react";

// Below this a logo is unreadable: show the store's initials instead
const MIN_CSS_PX = 14;
const MIN_SLOT_SHARE = 0.4;

// Never upscale a raster logo (some stores only have a 16-48px favicon): it is shown at most at
// 1 image pixel = 1 screen pixel, so logos come out at different sizes but never pixelated.
// SVGs scale cleanly and are left alone; their type is read from the cached response, only for small images.
// minNaturalPx: show any logo at least this big (image pixels) at its crisp size, centred, and only fall back to
// initials below it; without it, a logo lost in its box (under 40% of it) falls back too.
export function useCrispLogo({ minNaturalPx }: { minNaturalPx?: number } = {}): { style?: CSSProperties; tooSmall: boolean; measure: (el: HTMLImageElement | null) => void } {
  const [size, setSize] = useState<{ w: number; h: number; slot: number; natural: number }>();
  const checked = useRef(false);
  const measure = (el: HTMLImageElement | null) => {
    if (!el?.complete || !el.naturalWidth || checked.current) return;
    checked.current = true;
    const dpr = window.devicePixelRatio || 1;
    const w = el.naturalWidth / dpr;
    const h = el.naturalHeight / dpr;
    if (w >= el.clientWidth && h >= el.clientHeight) return;
    fetch(el.currentSrc)
      .then((r) => r.headers.get("content-type") ?? "")
      .then((type) => {
        if (!type.includes("svg")) setSize({ w: Math.floor(w), h: Math.floor(h), slot: Math.max(el.clientWidth, el.clientHeight), natural: Math.max(el.naturalWidth, el.naturalHeight) });
      })
      .catch(() => {}); // can't tell: leave the logo as it is
  };
  return {
    style: size ? { maxWidth: size.w, maxHeight: size.h } : undefined,
    // lost in its box (a 16px icon on a 112px card): the initials read better there
    tooSmall: !!size && (minNaturalPx ? size.natural < minNaturalPx : Math.max(size.w, size.h) < Math.max(MIN_CSS_PX, size.slot * MIN_SLOT_SHARE)),
    measure,
  };
}
