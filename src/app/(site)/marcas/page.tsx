import type { Metadata } from "next";
import Link from "next/link";
import { BRANDS, brandPath } from "@/lib/brands";
import { CATEGORIES } from "@/lib/catalog";
import { isPerk } from "@/lib/perks";
import { siteCoupons } from "@/lib/public-site";
import { siteUrl } from "@/lib/site-text";
import { Crumbs, JsonLd, crumbsLd } from "../site-ui";

export const metadata: Metadata = {
  title: "Marcas con ofertas y descuentos activos",
  description: "Ofertas y códigos descuento de las marcas más buscadas (Samsung, Apple, Nike, Adidas, Dyson…) reunidas de todas las tiendas.",
  alternates: { canonical: "/marcas" },
};

// Every brand with at least one live deal today, grouped by category; the rest of the catalog waits off the list
export default async function BrandsPage() {
  const counts = new Map<string, { n: number; stores: Set<string> }>();
  for (const c of await siteCoupons()) {
    if (isPerk(c)) continue;
    for (const b of c.brand_slugs) {
      const e = counts.get(b) ?? { n: 0, stores: new Set<string>() };
      e.n++;
      e.stores.add(c.store_slug);
      counts.set(b, e);
    }
  }
  const brands = BRANDS.filter((b) => counts.has(b.slug))
    .map((b) => ({ ...b, n: counts.get(b.slug)!.n, stores: counts.get(b.slug)!.stores.size }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  const groups = [...CATEGORIES.map((c) => ({ slug: c.slug as string, label: c.label })), { slug: "", label: "Otras marcas" }]
    .map((g) => ({ ...g, brands: brands.filter((b) => b.category === g.slug) }))
    .filter((g) => g.brands.length);
  const base = siteUrl();
  const crumbs = [{ name: "Inicio", href: "/" }, { name: "Marcas" }];

  return (
    <main className="wrap">
      <JsonLd data={crumbsLd(base, crumbs)} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "Marcas con ofertas",
          numberOfItems: brands.length,
          itemListElement: brands.map((b, i) => ({ "@type": "ListItem", position: i + 1, name: b.name, url: `${base}${brandPath(b.slug)}` })),
        }}
      />
      <Crumbs items={crumbs} />
      <section className="intro is-sub">
        <h1>Marcas con ofertas y descuentos activos</h1>
        <p className="answer" data-seo="Respuesta citable (GEO)">
          Hoy hay ofertas de <strong>{brands.length === 1 ? "1 marca" : `${brands.length} marcas`}</strong>. Cada página reúne las ofertas de esa marca en todas las tiendas que seguimos, para que veas dónde sale más barata.
        </p>
      </section>
      {groups.length === 0 ? (
        <p className="empty">
          Ahora mismo no hay ofertas de ninguna marca. <Link href="/">Volver a los chollos de hoy</Link>
        </p>
      ) : (
        groups.map((g) => (
          <section key={g.slug || "otras"} className="letter" aria-labelledby={`marcas-${g.slug || "otras"}`}>
            <h2 id={`marcas-${g.slug || "otras"}`}>{g.label}</h2>
            <ul className="store-grid">
              {g.brands.map((b) => (
                <li key={b.slug}>
                  <Link className="store-card" href={brandPath(b.slug)}>
                    <span className="tile" aria-hidden="true">
                      <span className="initial">{b.name.charAt(0).toUpperCase()}</span>
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <b>{b.name}</b>
                      <small>
                        {b.n} {b.n === 1 ? "oferta" : "ofertas"} · {b.stores === 1 ? "1 tienda" : `${b.stores} tiendas`}
                      </small>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}
