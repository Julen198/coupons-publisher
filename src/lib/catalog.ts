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
