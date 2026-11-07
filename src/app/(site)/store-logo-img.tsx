"use client";

import { useEffect, useRef, useState } from "react";
import { initialsOf } from "@/lib/initials";
import { useCrispLogo } from "../use-crisp-logo";

// Smaller than this (image pixels) a logo is a smudge: initials read better
const MIN_LOGO_PX = 64; // a 32-48px favicon shown at its crisp 16-24px is lost in a 44-112px tile

// An app-style icon (opaque to its corners, square, at least 96px) fills the whole tile instead of sitting as a stamp
// inside it; a transparent glyph keeps the tile's white margin. Our own route, so the canvas can read it.
function isFullBleed(img: HTMLImageElement): boolean {
  const w = img.naturalWidth, h = img.naturalHeight;
  if (!w || Math.abs(w - h) > w * 0.05 || Math.min(w, h) < 96) return false;
  try {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0);
    return [[1, 1], [w - 2, 1], [1, h - 2], [w - 2, h - 2]].every(([x, y]) => ctx.getImageData(x, y, 1, 1).data[3] > 250);
  } catch {
    return false; // can't read it: leave it as it is
  }
}

// A store's logo from /store-logo/<slug>, or its initials when it has none (or the image fails, or is under 64px).
// A logo too small for its frame is shown at its own crisp size, centred in the tile (the frames are grids).
export function StoreLogoImg({ slug, name, hasLogo, className }: { slug: string; name: string; hasLogo: boolean; className?: string }) {
  const [failed, setFailed] = useState(false);
  const [full, setFull] = useState(false);
  // the tiny header icon (.slogo) keeps the usual rule: nothing rather than a smudge there
  const { style, tooSmall, measure } = useCrispLogo(className === "slogo" ? {} : { minNaturalPx: MIN_LOGO_PX });
  if (hasLogo && !failed && !tooSmall) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- small icon from our own route
      <img
        ref={measure}
        src={`/store-logo/${slug}`}
        alt={`Logo de ${name}`}
        className={[className, full && "logo-full"].filter(Boolean).join(" ") || undefined}
        style={full ? undefined : style}
        loading="lazy"
        onLoad={(e) => {
          measure(e.currentTarget);
          if (className !== "slogo") setFull(isFullBleed(e.currentTarget));
        }}
        onError={() => setFailed(true)}
      />
    );
  }
  return className === "slogo" ? null : (
    <span className="initial" data-n={initialsOf(name).length} aria-hidden="true">
      {initialsOf(name)}
    </span>
  );
}

interface StoreBrandProps {
  slug: string;
  name: string;
  hasLogo: boolean;
  hasWordmark: boolean;
}

// Where there's room for the name: the store's wordmark (/store-logo/<slug>?v=wordmark, the logo with its letters)
// on a white landscape box, else its square icon (StoreLogoImg: full-bleed rule, initials). The frame turns landscape
// through CSS (:has(img.wordmark)), so without a wordmark it looks exactly as before.
// Reads a loaded wordmark once: crops the empty margin baked into the file (so the name fills its box) and tells
// whether its ink is light (a logo made for a dark header: white on our white box it would vanish).
// Our own route, so the canvas can read it; anything unreadable leaves the image as it is.
function inspectWordmark(img: HTMLImageElement): { src?: string; light: boolean } {
  const w = img.naturalWidth, h = img.naturalHeight;
  if (!w || !h) return { light: false };
  try {
    const scale = Math.min(1, 800 / w); // big files: analyse a smaller copy
    const cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
    const c = document.createElement("canvas");
    c.width = cw; c.height = ch;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { light: false };
    ctx.drawImage(img, 0, 0, cw, ch);
    const d = ctx.getImageData(0, 0, cw, ch).data;
    const lum = (i: number) => (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    // a white backdrop baked into the file counts as empty, like transparency
    const whiteBackdrop = d[3] > 250 && lum(0) > 0.95;
    let x0 = cw, y0 = ch, x1 = -1, y1 = -1, ink = 0, sum = 0;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const i = (y * cw + x) * 4;
        if (d[i + 3] < 24 || (whiteBackdrop && lum(i) > 0.95)) continue;
        ink++; sum += lum(i);
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    if (!ink) return { light: false };
    const light = !whiteBackdrop && sum / ink > 0.82;
    const pad = 2;
    const bx = Math.max(0, x0 - pad), by = Math.max(0, y0 - pad), bw = Math.min(cw, x1 + pad + 1) - bx, bh = Math.min(ch, y1 + pad + 1) - by;
    if (bw >= cw * 0.95 && bh >= ch * 0.95) return { light }; // nothing worth cropping
    const out = document.createElement("canvas");
    out.width = Math.round(bw / scale); out.height = Math.round(bh / scale);
    out.getContext("2d")?.drawImage(img, bx / scale, by / scale, bw / scale, bh / scale, 0, 0, out.width, out.height);
    return { src: out.toDataURL("image/png"), light };
  } catch {
    return { light: false };
  }
}

export function StoreBrand({ slug, name, hasLogo, hasWordmark }: StoreBrandProps) {
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<{ src?: string; light: boolean }>();
  const ref = useRef<HTMLImageElement>(null);
  // a cached image can finish loading before React listens for onLoad: inspect it on mount too
  useEffect(() => {
    const el = ref.current;
    if (el?.complete && el.naturalWidth && !view) setView(inspectWordmark(el));
  }, [view]);
  if (!hasWordmark || failed) return <StoreLogoImg slug={slug} name={name} hasLogo={hasLogo} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- wordmark from our own route (or its cropped copy)
    <img
      ref={ref}
      src={view?.src ?? `/store-logo/${slug}?v=wordmark`}
      alt={`Logo de ${name}`}
      className={view?.light ? "wordmark wm-light" : "wordmark"}
      loading="lazy"
      decoding="async"
      onLoad={(e) => { if (!view) setView(inspectWordmark(e.currentTarget)); }}
      onError={() => setFailed(true)}
    />
  );
}

// A deal's product picture (network feed or the store's own page); falls back to the store logo if the image fails to load
// (the wordmark when `hasWordmark`, for the frames with room for it). width/height reserve a square box before it
// loads (CSS sizes it to its frame, object-fit: contain).
export function DealImg({ src, title, slug, name, hasLogo, hasWordmark = false }: { src: string; title: string; slug: string; name: string; hasLogo: boolean; hasWordmark?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <StoreBrand slug={slug} name={name} hasLogo={hasLogo} hasWordmark={hasWordmark} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote product image from the store's or network's CDN, any host
    <img src={src} alt={title} className="prod" width={400} height={400} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
  );
}
