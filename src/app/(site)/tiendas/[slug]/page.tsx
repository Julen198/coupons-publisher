import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { pageTitle, parseFaqs } from "@/lib/affiliate";
import { hasStoreGuide } from "@/lib/catalog";
import { siteClient, siteCoupons, siteStore } from "@/lib/public-site";
import { longDate, madridToday, percentOf, siteUrl } from "@/lib/site-text";
import { StoreLogoImg } from "../../store-logo-img";
import { Crumbs, DealCard, Faqs, JsonLd, StoreFacts, badgeOf, crumbsLd, faqLd, offerLd } from "../../site-ui";

async function load(slug: string) {
  const store = await siteStore(slug);
  if (!store) return undefined;
  const all = await siteCoupons();
  return { store, all, coupons: all.filter((c) => c.store_id === store.id) };
}

export async function generateMetadata({ params }: PageProps<"/tiendas/[slug]">): Promise<Metadata> {
  const found = await load((await params).slug);
  if (!found) return { title: "Tienda no encontrada", robots: { index: false } };
  const { store, coupons } = found;
  const codes = coupons.filter((c) => c.kind === "code").length;
  return {
    title: { absolute: `${pageTitle(store.name, coupons.map((c) => c.discount), new Date())} | CuponLab` },
    description: `${coupons.length} cupones activos de ${store.name} (${codes} códigos descuento), con condiciones y fecha de caducidad.`,
    alternates: { canonical: `/tiendas/${store.slug}` },
    // a store with nothing live is a thin page: keep it reachable but out of the index
    robots: coupons.length ? undefined : { index: false, follow: true },
  };
}

export default async function StorePage({ params }: PageProps<"/tiendas/[slug]">) {
  const found = await load((await params).slug);
  if (!found) notFound();
  const { store, all, coupons } = found;
  const client = await siteClient();
  const now = new Date();
  const { iso: today, words: todayWords } = madridToday(now);
  const base = siteUrl();
  const faqs = parseFaqs(store.faqs);
  const codes = coupons.filter((c) => c.kind === "code").length;
  const verified = coupons.filter((c) => c.verified).length;
  const best = [...coupons].sort((a, b) => percentOf(b.discount) - percentOf(a.discount))[0];
  const sorted = [...coupons].sort((a, b) => b.verified - a.verified || percentOf(b.discount) - percentOf(a.discount) || b.id - a.id);
  const crumbs = [{ name: "Inicio", href: "/" }, { name: "Tiendas", href: "/tiendas" }, { name: store.name }];
  const title = pageTitle(store.name, coupons.map((c) => c.discount), now);

  const counts = new Map<string, { name: string; slug: string; n: number }>();
  for (const c of all) if (c.store_id !== store.id) counts.set(c.store_slug, { name: c.store_name, slug: c.store_slug, n: (counts.get(c.store_slug)?.n ?? 0) + 1 });
  const otherStores = [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 6);

  return (
    <main>
      <JsonLd data={crumbsLd(base, crumbs)} />
      {sorted.length > 0 && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: `Códigos descuento ${store.name}`,
            numberOfItems: sorted.length,
            itemListElement: sorted.map((c, i) => ({ "@type": "ListItem", position: i + 1, item: offerLd(base, c) })),
          }}
        />
      )}
      {faqs.length > 0 && <JsonLd data={faqLd(faqs)} />}

      <div className="wrap">
        <Crumbs items={crumbs} />
        <section className="intro">
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <span className="thumb" style={{ width: 72, height: 72 }}>
              <StoreLogoImg slug={store.slug} name={store.name} hasLogo={store.has_logo} />
            </span>
            <h1>{title}</h1>
          </div>
          <div className="meta-line">
            <span className="live">Actualizado el {todayWords}</span>
            <span>Por el equipo editorial de CuponLab</span>
          </div>
          <p className="answer">
            {coupons.length ? (
              <>
                Hoy hay <strong>{coupons.length} {coupons.length === 1 ? "cupón activo" : "cupones activos"}</strong> de {store.name}: {codes} con código y {coupons.length - codes} sin código, {verified} comprobados por el equipo.
                {best && percentOf(best.discount) > 0 && (
                  <>
                    {" "}El mejor es <strong>{badgeOf(best)}</strong>
                    {best.kind === "code" && best.code ? <> con el código <strong>{best.code}</strong></> : null}
                    {best.expires_at ? <>, válido hasta el {longDate(best.expires_at)}</> : null}.
                  </>
                )}
              </>
            ) : (
              <>
                Ahora mismo no hay cupones activos de {store.name}. Lo revisamos a diario: vuelve pronto o mira los <Link href="/">chollos de hoy</Link>.
              </>
            )}
          </p>
        </section>

        <div className="grid">
          <section aria-labelledby="storeDeals">
            <h2 id="storeDeals" className="feed-title">Cupones de {store.name}</h2>
            {sorted.length ? (
              <div className="feed">
                {sorted.map((c) => (
                  <DealCard key={c.id} c={c} client={client} today={today} />
                ))}
              </div>
            ) : (
              <p className="empty">No hay cupones activos de {store.name} hoy.</p>
            )}
          </section>
          <aside className="rail">
            <section className="panel">
              <h2>{store.name} en cifras</h2>
              <ul className="stores">
                <li><span>Cupones activos<small>{coupons.length}</small></span></li>
                <li><span>Con código<small>{codes}</small></span></li>
                <li><span>Comprobados<small>{verified}</small></span></li>
              </ul>
              {store.website && (
                <p className="small">
                  Web oficial: {store.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                </p>
              )}
            </section>
            {otherStores.length > 0 && (
              <section className="panel">
                <h2>Otras tiendas con cupones</h2>
                <ul className="stores">
                  {otherStores.map((s) => (
                    <li key={s.slug}>
                      <Link href={`/tiendas/${s.slug}`}>
                        {s.name}
                        <small>{s.n} {s.n === 1 ? "cupón" : "cupones"}</small>
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link href="/tiendas">Ver todas las tiendas</Link>
              </section>
            )}
          </aside>
        </div>
      </div>

      {(hasStoreGuide(store) || faqs.length > 0) && (
        <div className="longform">
          <div className="wrap">
            {hasStoreGuide(store) && (
              <section className="two">
                <div className="section-head">
                  <h2>Lo que conviene saber de {store.name}</h2>
                </div>
                <div style={{ display: "grid", gap: 12 }}>
                  <StoreFacts text={store.facts} />
                  {store.intro && <p style={{ color: "var(--ink-2)", whiteSpace: "pre-line" }}>{store.intro}</p>}
                </div>
              </section>
            )}
            {faqs.length > 0 && (
              <section className="two">
                <div className="section-head">
                  <h2>Preguntas frecuentes sobre {store.name}</h2>
                </div>
                <Faqs items={faqs} />
              </section>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
