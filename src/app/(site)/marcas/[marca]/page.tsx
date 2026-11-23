import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BRANDS, brandFaqs, brandOf, brandPath, brandTitle, indexableBrand, listOf, type Brand } from "@/lib/brands";
import { categoryOf, categoryPath, ordenOf, type Orden } from "@/lib/catalog";
import { pageSource } from "@/lib/click-signals";
import { sortDeals } from "@/lib/community";
import { badgeInSentence } from "@/lib/deal-text";
import { isPerk } from "@/lib/perks";
import { currentVotes, siteClient, siteCoupons, type SiteCoupon } from "@/lib/public-site";
import { longDate, madridToday, percentOf, siteUrl } from "@/lib/site-text";
import { Crumbs, DealCard, Faqs, JsonLd, badgeOf, crumbsLd, faqLd, offerLd } from "../../site-ui";

// One page per brand (/marcas/samsung): its live deals from every store, for «descuento <marca>» searches. The brands
// are a fixed list (brands.ts), so an unknown slug answers 404 from the proxy before the page streams. A deal's brands
// come from its title or are set by hand in the panel (dealBrands).

async function load(slug: string): Promise<{ brand: Brand; all: SiteCoupon[]; deals: SiteCoupon[] } | undefined> {
  const brand = brandOf(slug);
  if (!brand) return undefined;
  const all = await siteCoupons();
  // a brand has no standing offers of its own: those belong to the store (newsletter, app…)
  return { brand, all, deals: all.filter((c) => !isPerk(c) && c.brand_slugs.includes(brand.slug)) };
}

export async function generateMetadata({ params }: PageProps<"/marcas/[marca]">): Promise<Metadata> {
  const found = await load((await params).marca);
  if (!found) return { title: "Marca no encontrada", robots: { index: false } };
  const { brand, deals } = found;
  const stores = [...new Set(deals.map((c) => c.store_name))];
  const codes = deals.filter((c) => c.kind === "code" && c.code).length;
  return {
    title: { absolute: `${brandTitle(brand, deals, new Date())} | CuponLab` },
    description: deals.length
      ? `${deals.length === 1 ? "1 oferta activa" : `${deals.length} ofertas activas`} de ${brand.name} en ${stores.length === 1 ? stores[0] : `${stores.length} tiendas`}${codes ? ` (${codes === 1 ? "1 con código descuento" : `${codes} con código descuento`})` : ""}, con condiciones y fecha de caducidad.`
      : `Hoy no hay ofertas activas de ${brand.name}. Revisamos las tiendas a diario y las nuevas salen aquí.`,
    alternates: { canonical: brandPath(brand.slug) },
    // a brand with only a couple of deals would be a thin page: reachable and followed, out of the index
    robots: indexableBrand(deals.length) ? undefined : { index: false, follow: true },
  };
}

const SORT_TABS: [Orden, string][] = [
  ["destacados", "Más votados"],
  ["nuevos", "Nuevos"],
  ["ahorro", "Mayor ahorro"],
  ["comentados", "Comentados"],
  ["caducan", "Caducan pronto"],
];

const sortHref = (slug: string, orden: Orden) => (orden === "destacados" ? brandPath(slug) : `${brandPath(slug)}?orden=${orden}`);

export default async function BrandPage({ params, searchParams }: PageProps<"/marcas/[marca]">) {
  const found = await load((await params).marca);
  if (!found) notFound();
  const sp = await searchParams;
  const orden = ordenOf(typeof sp.orden === "string" ? sp.orden : "");
  const { brand, all, deals } = found;
  const [client, mine] = await Promise.all([siteClient(), currentVotes()]);
  const source = pageSource(sp, "marca");
  const now = new Date();
  const { iso: today } = madridToday(now);
  const base = siteUrl();
  const cat = categoryOf(brand.category);
  const crumbs = [{ name: "Inicio", href: "/" }, { name: "Marcas", href: "/marcas" }, { name: brand.name }];
  const sorted = sortDeals(deals, orden);
  const codes = deals.filter((c) => c.kind === "code" && c.code).length;
  const best = [...deals].sort((a, b) => percentOf(b.discount) - percentOf(a.discount) || b.verified - a.verified)[0];

  // where it is on sale today: stores by number of its deals
  const byStore = new Map<string, { name: string; slug: string; n: number }>();
  for (const c of deals) byStore.set(c.store_slug, { name: c.store_name, slug: c.store_slug, n: (byStore.get(c.store_slug)?.n ?? 0) + 1 });
  const stores = [...byStore.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, "es"));

  // other brands with live deals: same category first, then the most deals
  const counts = new Map<string, number>();
  for (const c of all) if (!isPerk(c)) for (const b of c.brand_slugs) counts.set(b, (counts.get(b) ?? 0) + 1);
  const otherBrands = BRANDS.filter((b) => b.slug !== brand.slug && counts.has(b.slug))
    .map((b) => ({ ...b, n: counts.get(b.slug)!, same: !!brand.category && b.category === brand.category }))
    .sort((a, b) => Number(b.same) - Number(a.same) || b.n - a.n)
    .slice(0, 8);
  const faqs = brandFaqs(brand, deals);
  const h1 = `Ofertas y descuentos de ${brand.name}`;

  return (
    <main>
      <JsonLd data={crumbsLd(base, crumbs)} />
      {sorted.length > 0 && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: h1,
            numberOfItems: sorted.length,
            itemListElement: sorted.map((c, i) => ({ "@type": "ListItem", position: i + 1, item: offerLd(base, c) })),
          }}
        />
      )}
      <JsonLd data={faqLd(faqs)} />

      <div className="wrap">
        <Crumbs items={crumbs} />
        <section className="store-hero">
          <div className="tile" aria-hidden="true">
            <span className="initial">{brand.name.charAt(0).toUpperCase()}</span>
          </div>
          <div>
            <h1 data-seo="H1 con intención">{h1}</h1>
            <div className="meta-line">
              <span className="live">Actualizado hoy</span>
              <span>{deals.length === 1 ? "1 oferta activa" : `${deals.length} ofertas activas`}</span>
              {stores.length > 0 && <span>{stores.length === 1 ? "en 1 tienda" : `en ${stores.length} tiendas`}</span>}
            </div>
            <p className="answer" data-seo="Respuesta citable (GEO)">
              {deals.length ? (
                <>
                  Hoy hay <strong>{deals.length === 1 ? "1 oferta" : `${deals.length} ofertas`} de {brand.name}</strong> en {listOf(stores.slice(0, 4).map((s) => s.name))}
                  {stores.length > 4 ? <> y {stores.length - 4} {stores.length - 4 === 1 ? "tienda más" : "tiendas más"}</> : null}, {codes} con código.
                  {best && percentOf(best.discount) > 0 && (
                    <>
                      {" "}El mayor descuento es <strong>{badgeInSentence(badgeOf(best))}</strong> en {best.store_name}
                      {best.expires_at ? <>, válido hasta el {longDate(best.expires_at)}</> : null}.
                    </>
                  )}
                </>
              ) : (
                <>
                  Ahora mismo no hay ofertas activas de {brand.name}. Lo revisamos a diario: vuelve pronto o mira los <Link href={cat ? categoryPath(cat.slug) : "/"}>{cat ? `chollos de ${cat.label.toLowerCase()}` : "chollos de hoy"}</Link>.
                </>
              )}
            </p>
          </div>
        </section>

        <div className="grid">
          <section id="chollos" aria-labelledby="brandDeals">
            <h2 id="brandDeals" className="feed-title">Ofertas de {brand.name}</h2>
            {sorted.length > 1 && (
              <div className="toolbar">
                <nav className="tabs" aria-label="Orden">
                  {SORT_TABS.map(([k, label]) => (
                    <Link key={k} href={sortHref(brand.slug, k)} aria-current={orden === k ? "page" : undefined}>
                      {label}
                    </Link>
                  ))}
                </nav>
              </div>
            )}
            {sorted.length ? (
              <div className="feed">
                {sorted.map((c) => (
                  <DealCard key={c.id} c={c} client={client} today={today} now={now} mine={mine} next={sortHref(brand.slug, orden)} source={source} />
                ))}
              </div>
            ) : (
              <div className="panel">
                <h3>No hay ofertas de {brand.name} hoy</h3>
                <p className="small">
                  Publicamos chollos nuevos cada día. Mientras tanto, <Link href="/">mira los chollos de otras marcas</Link>.
                </p>
              </div>
            )}
          </section>
          <aside className="rail">
            {stores.length > 0 && (
              <section className="panel" data-seo="Enlazado interno marca → tiendas">
                <h2>Dónde comprar {brand.name}</h2>
                <ul className="stores">
                  {stores.slice(0, 8).map((s) => (
                    <li key={s.slug}>
                      <Link href={`/tiendas/${s.slug}`}>
                        {s.name}
                        <small>{s.n} {s.n === 1 ? "oferta" : "ofertas"}</small>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {otherBrands.length > 0 && (
              <section className="panel" data-seo="Enlazado interno entre marcas">
                <h2>{cat && otherBrands.some((b) => b.same) ? `Otras marcas de ${cat.label.toLowerCase()}` : "Otras marcas con ofertas"}</h2>
                <ul className="stores">
                  {otherBrands.map((b) => (
                    <li key={b.slug}>
                      <Link href={brandPath(b.slug)}>
                        {b.name}
                        <small>{b.n} {b.n === 1 ? "oferta" : "ofertas"}</small>
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link href="/marcas" className="small">Ver todas las marcas</Link>
              </section>
            )}
          </aside>
        </div>
      </div>

      <div className="longform">
        <div className="wrap">
          <section className="two" data-seo="Texto único por marca">
            <div className="section-head">
              <h2>Sobre {brand.name}</h2>
            </div>
            <p className="lead">
              {brand.about} En esta página reunimos sus ofertas de todas las tiendas que seguimos, para que compares dónde sale más barato sin ir tienda por tienda.
            </p>
          </section>
          <section className="two">
            <div className="section-head">
              <h2>Preguntas sobre los descuentos de {brand.name}</h2>
            </div>
            <Faqs items={faqs} />
          </section>
        </div>
      </div>
    </main>
  );
}
