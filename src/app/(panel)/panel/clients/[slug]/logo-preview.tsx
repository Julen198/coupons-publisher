"use client";

import { useState } from "react";

// Many publisher CDNs block hotlinking (403), so say so instead of showing an empty box
export function LogoPreview({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <span className="text-xs text-amber-700 dark:text-amber-400">No se pudo cargar el logo (su web puede bloquear el enlace directo). La demo usará el nombre.</span>;
  }
  return (
    // white chip: logos are drawn for their own (usually light) site and vanish on the dark theme
    // eslint-disable-next-line @next/next/no-img-element -- arbitrary external logo, preview only
    <img
      src={src}
      alt={`Logo de ${name}`}
      onError={() => setFailed(true)}
      className="h-10 w-auto max-w-56 rounded-md bg-white object-contain p-1.5 ring-1 ring-neutral-200 dark:ring-neutral-700"
    />
  );
}
