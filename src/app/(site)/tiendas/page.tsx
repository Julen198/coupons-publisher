import type { Metadata } from "next";
import Link from "next/link";
import { CATEGORIES, categoryOf } from "@/lib/catalog";
import { siteCoupons, type SiteCoupon } from "@/lib/public-site";
import { siteUrl } from "@/lib/site-text";
import { bestDiscountLine } from "@/lib/store-list";
import { StoreBrand } from "../store-logo-img";
import { Crumbs, JsonLd, crumbsLd } from "../site-ui";

export const metadata: Metadata = {
  title: "Tiendas con cupones y chollos activos",
  description: "Las tiendas con cupones y códigos descuento activos hoy en CuponLab, de la A a la Z.",
  alternates: { canonical: "/tiendas" },
};

// A–Z of every store with at least one live coupon (stores with none would be thin pages)
const catHref = (slug: string) => (slug ? `/tiendas?cat=${slug}` : "/tiendas");

export default async function StoresPage({ searchParams }: PageProps<"/tiendas">) {
  const rawCat = (await searchParams).cat;
  const cat = categoryOf(typeof rawCat === "string" ? rawCat : "");
  const coupons = (await siteCoupons()).filter((c) => !cat || c.store_category === cat.slug);
  const byStore = new Map<string, { name: string; slug: string; hasLogo: boolean; hasWordmark: boolean; count: number; coupons: SiteCoupon[] }>();
  for (const c of coupons) {
    const s = byStore.get(c.store_slug) ?? { name: c.store_name, slug: c.store_slug, hasLogo: c.store_has_logo, hasWordmark: !!c.store_has_wordmark, count: 0, coupons: [] };
    s.count++;
    s.coupons.push(c);
    byStore.set(c.store_slug, s);
  }
  const stores = [...byStore.values()].sort((a, b) => a.name.localeCompare(b.name, "es")).map((s) => ({ ...s, best: bestDiscountLine(s.coupons) }));
  const letterOf = (name: string) => {
    const l = name.normalize("NFD").charAt(0).toUpperCase();
    return /[A-Z]/.test(l) ? l : "#";
  };
  const groups = new Map<string, typeof stores>();
  for (const s of stores) groups.set(letterOf(s.name), [...(groups.get(letterOf(s.name)) ?? []), s]);
  const base = siteUrl();
  const crumbs = [{ name: "Inicio", href: "/" }, { name: "Tiendas" }];

  return (
    <main className="wrap">
      <JsonLd data={crumbsLd(base, crumbs)} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "Tiendas con códigos descuento",
          numberOfItems: stores.length,
          itemListElement: stores.map((s, i) => ({ "@type": "ListItem", position: i + 1, name: s.name, url: `${base}/tiendas/${s.slug}` })),
        }}
      />
      <Crumbs items={crumbs} />
      <section className="intro is-sub">
        <h1>Tiendas con cupones y chollos activos</h1>
        <p className="answer" data-seo="Respuesta citable (GEO)">
          Hoy hay <strong>{stores.length === 1 ? "1 tienda" : `${stores.length} tiendas`}</strong>{cat ? <> de {cat.label}</> : null} con al menos un cupón activo. Cada ficha tiene sus cupones de hoy, sus condiciones de envío y devoluciones y lo que conviene saber antes de usar un código.
        </p>
      </section>
      <div className="toolbar">
        <nav className="tabs" aria-label="Categoría">
          {[{ slug: "", label: "Todas" }, ...CATEGORIES].map((c) => (
            <Link key={c.slug} href={catHref(c.slug)} aria-current={(cat?.slug ?? "") === c.slug ? "page" : undefined}>
              {c.label}
            </Link>
          ))}
        </nav>
        {groups.size > 1 && (
          <nav className="az" aria-label="Por letra">
            {[...groups.keys()].map((l) => (
              <a key={l} href={`#letra-${l}`}>
                {l}
              </a>
            ))}
          </nav>
        )}
      </div>
      {stores.length === 0 ? (
        <p className="empty">
          {cat ? <>Ahora mismo no hay tiendas de {cat.label} con cupones activos. <Link href="/tiendas">Ver todas las tiendas</Link></> : <>Ahora mismo no hay tiendas con cupones activos. <Link href="/">Volver a los chollos de hoy</Link></>}
        </p>
      ) : (
        [...groups.entries()].map(([letter, list]) => (
          <section key={letter} id={`letra-${letter}`} className="letter" style={{ scrollMarginTop: 120 }}>
            <h2>{letter}</h2>
            <ul className="store-grid">
              {list.map((s) => (
                <li key={s.slug}>
                  <Link className="store-card" href={`/tiendas/${s.slug}`}>
                    <span className="tile">
                      <StoreBrand slug={s.slug} name={s.name} hasLogo={s.hasLogo} hasWordmark={s.hasWordmark} />
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <b>{s.name}</b>
                      <small>
                        {s.count} {s.count === 1 ? "cupón" : "cupones"}
                      </small>
                      {s.best && <span className="best">{s.best}</span>}
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
