"use client";

import { useState } from "react";
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
export function StoreBrand({ slug, name, hasLogo, hasWordmark }: StoreBrandProps) {
  const [failed, setFailed] = useState(false);
  if (!hasWordmark || failed) return <StoreLogoImg slug={slug} name={name} hasLogo={hasLogo} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- wordmark from our own route
    <img src={`/store-logo/${slug}?v=wordmark`} alt={`Logo de ${name}`} className="wordmark" loading="lazy" decoding="async" onError={() => setFailed(true)} />
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
