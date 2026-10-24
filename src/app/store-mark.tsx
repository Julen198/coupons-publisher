"use client";

import { useState } from "react";

// A store's icon on a white tile, or its initial when it has none (or the image fails)
export function StoreMark({ slug, name, hasLogo, size = "sm" }: { slug: string; name: string; hasLogo: boolean; size?: "sm" | "md" | "lg" }) {
  const [failed, setFailed] = useState(false);
  const box = { sm: "size-7 rounded-md", md: "size-8 rounded-md", lg: "size-14 rounded-xl" }[size];
  if (hasLogo && !failed) {
    return (
      <span className={`flex ${box} shrink-0 items-center justify-center overflow-hidden border border-neutral-200 bg-white dark:border-neutral-700`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- small embedded icon from our own route */}
        <img src={`/store-logo/${slug}`} alt="" onError={() => setFailed(true)} className="size-full object-contain p-0.5" />
      </span>
    );
  }
  return (
    <span aria-hidden="true" className={`flex ${box} shrink-0 items-center justify-center bg-neutral-900 text-xs font-bold text-white dark:bg-neutral-100 dark:text-neutral-900 ${size === "lg" ? "text-xl" : ""}`}>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
