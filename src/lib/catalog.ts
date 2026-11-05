// Shop categories readers browse by, and the short facts each store page lists (envío, devoluciones…)

export const CATEGORIES = [
  { slug: "tecnologia", label: "Tecnología" },
  { slug: "zapatillas", label: "Zapatillas" },
  { slug: "moda", label: "Moda" },
  { slug: "hogar", label: "Hogar" },
  { slug: "deporte", label: "Deporte" },
  { slug: "viajes", label: "Viajes" },
] as const;

export type CategorySlug = (typeof CATEGORIES)[number]["slug"];
export type Category = { slug: CategorySlug; label: string };

export const categoryOf = (slug: string): Category | undefined => CATEGORIES.find((c) => c.slug === slug);

// "Envío | Gratis desde 50 €" per line → [{ label: "Envío", value: "Gratis desde 50 €" }]; lines missing a side are skipped
export function factsOf(text: string): { label: string; value: string }[] {
  return text.split("\n").flatMap((line) => {
    const at = line.indexOf("|");
    if (at < 0) return [];
    const label = line.slice(0, at).trim();
    const value = line.slice(at + 1).trim();
    return label && value ? [{ label, value }] : [];
  });
}

// A store's category from a form field: a known slug, or "" (no category)
export const storeCategory = (raw: string): CategorySlug | "" => categoryOf(raw.trim())?.slug ?? "";

// Home page filters, as read from the URL
export type HomeFilters = {
  cat: CategorySlug | "";
  tipo: "todos" | "codigos" | "ofertas";
  orden: "destacados" | "nuevos" | "ahorro" | "caducan";
  comprobados: boolean;
  q: string;
  pagina: number;
};

// Link to the home page with some filters changed; any change goes back to page 1 unless it sets the page
export function homeHref(f: HomeFilters, change: Partial<HomeFilters>): string {
  const n = { ...f, pagina: 1, ...change };
  const q = new URLSearchParams();
  if (n.q) q.set("q", n.q);
  if (n.cat) q.set("cat", n.cat);
  if (n.tipo !== "todos") q.set("tipo", n.tipo);
  if (n.orden !== "destacados") q.set("orden", n.orden);
  if (n.comprobados) q.set("comprobados", "1");
  if (n.pagina > 1) q.set("pagina", String(n.pagina));
  const s = q.toString();
  return s ? `/?${s}` : "/";
}

// A store guide is worth showing only with an intro or at least one fact that factsOf can read
export const hasStoreGuide = (s: { intro: string; facts: string }): boolean => s.intro.trim() !== "" || factsOf(s.facts).length > 0;

// "Ver todos" link for an empty feed: back to the category when other filters emptied it, else the whole home page
export function resetFiltersHref(f: HomeFilters): string {
  const otherFilters = f.q !== "" || f.tipo !== "todos" || f.comprobados;
  return f.cat && otherFilters ? homeHref({ cat: f.cat, tipo: "todos", orden: "destacados", comprobados: false, q: "", pagina: 1 }, {}) : "/";
}
