"use client";

import { useState } from "react";

interface ClientMarkProps {
  name: string;
  logoUrl: string;
  color: string;
  size: "sm" | "lg"; // list row / client header
}

// The client's logo on a white tile (logos are drawn for light sites, so dark mode keeps the tile white);
// falls back to the initial on the brand colour when there is no logo or its CDN refuses hotlinking.
export function ClientMark({ name, logoUrl, color, size }: ClientMarkProps) {
  const [failed, setFailed] = useState(false);
  const box = size === "lg" ? "h-11" : "h-9";

  if (logoUrl && !failed) {
    return (
      <span className={`flex ${box} shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white px-2 dark:border-neutral-700 ${size === "lg" ? "max-w-48" : "w-24"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary external or embedded logo */}
        <img src={logoUrl} alt={`Logo de ${name}`} onError={() => setFailed(true)} className="max-h-[70%] w-auto max-w-full object-contain" />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`flex ${box} ${size === "lg" ? "w-11 text-lg" : "w-9"} shrink-0 items-center justify-center rounded-lg font-serif font-bold text-white`}
      style={{ background: color }}
    >
      {name.charAt(0)}
    </span>
  );
}
