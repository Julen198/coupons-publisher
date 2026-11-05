"use client";

import { useState } from "react";

// "43einhalb" → "43", "El Corte Inglés" → "ECI", "PcComponentes" → "PC", "zalando" → "Z"
export function initialsOf(name: string): string {
  const digits = /^\d{1,2}/.exec(name)?.[0];
  if (digits) return digits;
  const caps = (name.match(/\p{Lu}/gu) ?? []).slice(0, 3).join("");
  return caps || name.charAt(0).toUpperCase();
}

// A store's logo from /store-logo/<slug>, or its initials when it has none (or the image fails)
export function StoreLogoImg({ slug, name, hasLogo, className }: { slug: string; name: string; hasLogo: boolean; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (hasLogo && !failed) {
    // eslint-disable-next-line @next/next/no-img-element -- small icon from our own route
    return <img src={`/store-logo/${slug}`} alt={`Logo de ${name}`} className={className} loading="lazy" onError={() => setFailed(true)} />;
  }
  return className === "slogo" ? null : (
    <span className="initial" aria-hidden="true">
      {initialsOf(name)}
    </span>
  );
}
