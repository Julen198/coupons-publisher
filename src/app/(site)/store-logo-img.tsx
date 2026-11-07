"use client";

import { useState } from "react";
import { useCrispLogo } from "../use-crisp-logo";

// "43einhalb" → "43", "El Corte Inglés" → "ECI", "PcComponentes" → "PC", "zalando" → "Z"
export function initialsOf(name: string): string {
  const digits = /^\d{1,2}/.exec(name)?.[0];
  if (digits) return digits;
  const caps = (name.match(/\p{Lu}/gu) ?? []).slice(0, 3).join("");
  return caps || name.charAt(0).toUpperCase();
}

// Smaller than this (image pixels) a logo is a smudge: initials read better
const MIN_LOGO_PX = 24;

// A store's logo from /store-logo/<slug>, or its initials when it has none (or the image fails, or is under 24px).
// A logo too small for its frame is shown at its own crisp size, centred in the tile (the frames are grids).
export function StoreLogoImg({ slug, name, hasLogo, className }: { slug: string; name: string; hasLogo: boolean; className?: string }) {
  const [failed, setFailed] = useState(false);
  // the tiny header icon (.slogo) keeps the usual rule: nothing rather than a smudge there
  const { style, tooSmall, measure } = useCrispLogo(className === "slogo" ? {} : { minNaturalPx: MIN_LOGO_PX });
  if (hasLogo && !failed && !tooSmall) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- small icon from our own route
      <img
        ref={measure}
        src={`/store-logo/${slug}`}
        alt={`Logo de ${name}`}
        className={className}
        style={style}
        loading="lazy"
        onLoad={(e) => measure(e.currentTarget)}
        onError={() => setFailed(true)}
      />
    );
  }
  return className === "slogo" ? null : (
    <span className="initial" aria-hidden="true">
      {initialsOf(name)}
    </span>
  );
}

// A deal's product picture (network feed or the store's own page); falls back to the store logo if the image fails to load.
// width/height reserve a square box before it loads (CSS sizes it to its frame, object-fit: contain).
export function DealImg({ src, title, slug, name, hasLogo }: { src: string; title: string; slug: string; name: string; hasLogo: boolean }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <StoreLogoImg slug={slug} name={name} hasLogo={hasLogo} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote product image from the store's or network's CDN, any host
    <img src={src} alt={title} className="prod" width={400} height={400} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
  );
}
