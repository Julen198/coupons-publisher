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

// The facts every store page should have (the deal page's «Condiciones» lists them in this order). Filled by hand from
// the store's own website: never guessed.
export const KEY_FACTS = ["Envío", "Devoluciones", "Códigos por pedido", "Formas de pago"] as const;

// The key facts a store's text doesn't give yet (a line «Envío | …» with a value counts)
export function missingFacts(text: string): string[] {
  const have = factsOf(text).map((f) => f.label.toLowerCase());
  return KEY_FACTS.filter((k) => !have.some((h) => h.startsWith(k.toLowerCase())));
}

// The text with an empty «Label | » line for each missing key fact, ready to fill in (empty lines are not shown)
export function withFactTemplate(text: string): string {
  const missing = missingFacts(text);
  if (!missing.length) return text;
  const base = text.trimEnd();
  return [...(base ? [base] : []), ...missing.map((m) => `${m} | `)].join("\n");
}

// A store's category from a form field: a known slug, or "" (no category)
export const storeCategory = (raw: string): CategorySlug | "" => categoryOf(raw.trim())?.slug ?? "";

// Home page sorts, in tab order; "destacados" (Más votados) is the default and stays out of the URL
export const ORDENES = ["destacados", "nuevos", "ahorro", "comentados", "caducan"] as const;
export type Orden = (typeof ORDENES)[number];

export const ordenOf = (raw: string): Orden => ORDENES.find((o) => o === raw) ?? "destacados";

// Home page filters, as read from the URL
export type HomeFilters = {
  cat: CategorySlug | "";
  tipo: "todos" | "codigos" | "ofertas";
  orden: Orden;
  comprobados: boolean;
  q: string;
  pagina: number;
};

// A category's own page (indexable, in the sitemap)
export const categoryPath = (slug: string): string => `/categorias/${slug}`;

// Link to the home feed with some filters changed; any change goes back to page 1 unless it sets the page. A category
// without a search lives at /categorias/<slug>; a search stays on the home page (?q=…&cat=…), out of the index.
export function homeHref(f: HomeFilters, change: Partial<HomeFilters>): string {
  const n = { ...f, pagina: 1, ...change };
  const q = new URLSearchParams();
  if (n.q) q.set("q", n.q);
  if (n.cat && n.q) q.set("cat", n.cat);
  if (n.tipo !== "todos") q.set("tipo", n.tipo);
  if (n.orden !== "destacados") q.set("orden", n.orden);
  if (n.comprobados) q.set("comprobados", "1");
  if (n.pagina > 1) q.set("pagina", String(n.pagina));
  const s = q.toString();
  const path = n.cat && !n.q ? categoryPath(n.cat) : "/";
  return s ? `${path}?${s}` : path;
}

// A store guide is worth showing only with an intro or at least one fact that factsOf can read
export const hasStoreGuide = (s: { intro: string; facts: string }): boolean => s.intro.trim() !== "" || factsOf(s.facts).length > 0;

// "Ver todos" link for an empty feed: back to the category when other filters emptied it, else the whole home page
export function resetFiltersHref(f: HomeFilters): string {
  const otherFilters = f.q !== "" || f.tipo !== "todos" || f.comprobados;
  return f.cat && otherFilters ? homeHref({ cat: f.cat, tipo: "todos", orden: "destacados", comprobados: false, q: "", pagina: 1 }, {}) : "/";
}

export type EmptyFeedText = { title: string; hint: string; link: { href: string; label: string } | null };

// What the home feed says when nothing matches: what emptied it, what to try, and the way back to a full list
export function emptyFeedText(f: HomeFilters, catLabel: string): EmptyFeedText {
  const href = resetFiltersHref(f);
  const link = { href, label: href === "/" ? "Ver todos los chollos" : `Ver todos los chollos de ${catLabel}` };
  if (f.q) return { title: `No hay chollos para «${f.q}»`, hint: "Prueba con otra búsqueda.", link };
  if (f.comprobados || f.tipo !== "todos")
    return { title: "No hay chollos con estos filtros", hint: f.comprobados ? "Prueba con otra categoría o quita «Solo comprobados»." : "Prueba con otra categoría.", link };
  if (f.cat) return { title: `No hay chollos de ${catLabel} ahora mismo`, hint: "Prueba con otra categoría.", link };
  return { title: "No hay chollos ahora mismo", hint: "Publicamos cupones nuevos cada día.", link: null };
}
