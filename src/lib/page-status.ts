export type Coverage = "live" | "stale" | "draft" | "none";

interface PageFields {
  status: "draft" | "published" | "blocked";
  delivery: "html" | "widget";
  published_at: Date | null;
}

// Widget pages are served by us, so always current. An HTML export freezes the month in its title
// and its coupon list, so it goes stale once the month it was exported in is over.
export function coverageOf(page: PageFields | undefined, now = new Date()): Coverage {
  if (!page || page.status === "blocked") return "none";
  if (page.status !== "published" || !page.published_at) return "draft";
  if (page.delivery !== "html") return "live";
  const p = page.published_at;
  return p.getFullYear() === now.getFullYear() && p.getMonth() === now.getMonth() ? "live" : "stale";
}

export const COVERAGE_LABEL: Record<Coverage, string> = {
  live: "Publicada",
  stale: "Desactualizada",
  draft: "Borrador",
  none: "Sin página",
};

export const DELIVERY_LABEL = {
  html: "HTML",
  widget: "Widget",
} as const;
