import type { Metadata } from "next";
import Link from "next/link";
import { siteCoupons } from "@/lib/public-site";
import { madridToday, siteUrl } from "@/lib/site-text";
import { StoreLogoImg } from "../store-logo-img";
import { Crumbs, JsonLd, crumbsLd } from "../site-ui";

export const metadata: Metadata = {
  title: "Todas las tiendas con códigos descuento",
  description: "Las tiendas con cupones y códigos descuento activos hoy en CuponLab, de la A a la Z.",
  alternates: { canonical: "/tiendas" },
};

// A–Z of every store with at least one live coupon (stores with none would be thin pages)
export default async function StoresPage() {
  const coupons = await siteCoupons();
  const { words: todayWords } = madridToday();
  const byStore = new Map<string, { name: string; slug: string; hasLogo: boolean; count: number; codes: number }>();
  for (const c of coupons) {
    const s = byStore.get(c.store_slug) ?? { name: c.store_name, slug: c.store_slug, hasLogo: c.store_has_logo, count: 0, codes: 0 };
    s.count++;
    if (c.kind === "code") s.codes++;
    byStore.set(c.store_slug, s);
  }
  const stores = [...byStore.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
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
      <section className="intro">
        <h1>Todas las tiendas con códigos descuento</h1>
        <div className="meta-line">
          <span className="live">Actualizado el {todayWords}</span>
        </div>
        <p className="answer">
          Hoy hay <strong>{stores.length} tiendas</strong> con cupones activos en CuponLab. Cada una tiene su página con los códigos que funcionan, sus condiciones y lo que conviene saber antes de comprar.
        </p>
        {groups.size > 1 && (
          <nav className="letters" aria-label="Letras">
            {[...groups.keys()].map((l) => (
              <a key={l} href={`#letra-${l}`}>
                {l}
              </a>
            ))}
          </nav>
        )}
      </section>
      {stores.length === 0 ? (
        <p className="empty">
          Ahora mismo no hay tiendas con cupones activos. <Link href="/">Volver a los chollos de hoy</Link>
        </p>
      ) : (
        [...groups.entries()].map(([letter, list]) => (
          <section key={letter} id={`letra-${letter}`} className="page-sec" style={{ scrollMarginTop: 120 }}>
            <h2>{letter}</h2>
            <ul className="store-grid">
              {list.map((s) => (
                <li key={s.slug}>
                  <Link className="store-card" href={`/tiendas/${s.slug}`}>
                    <span className="tile">
                      <StoreLogoImg slug={s.slug} name={s.name} hasLogo={s.hasLogo} />
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <b>{s.name}</b>
                      <span>
                        {s.count} {s.count === 1 ? "cupón" : "cupones"}
                        {s.codes ? ` · ${s.codes} con código` : ""}
                      </span>
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
