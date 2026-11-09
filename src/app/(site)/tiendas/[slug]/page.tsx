import { pageSource } from "@/lib/click-signals";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { parseFaqs } from "@/lib/affiliate";
import { categoryOf, factsOf, ordenOf, type Orden } from "@/lib/catalog";
import { sortDeals } from "@/lib/community";
import { badgeInSentence, storeH1, storeHeading } from "@/lib/deal-text";
import { currentVotes, siteClient, siteCoupons, siteStore } from "@/lib/public-site";
import { longDate, madridToday, percentOf, siteUrl } from "@/lib/site-text";
import { storeGuide } from "@/lib/store-guides";
import { MarkHeaderCategory } from "../../site-header";
import { StoreBrand } from "../../store-logo-img";
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
  const codes = coupons.filter((c) => c.kind === "code" && c.code).length;
  const guide = storeGuide(store.slug);
  return {
    title: { absolute: `${storeHeading(store.name, coupons, new Date())} | CuponLab` },
    description:
      guide && coupons.length
        ? guide.description
        : `${coupons.length} cupones activos de ${store.name} (${codes} códigos descuento), con condiciones y fecha de caducidad.`,
    alternates: { canonical: `/tiendas/${store.slug}` },
    // a store with nothing live is a thin page: keep it reachable but out of the index
    robots: coupons.length ? undefined : { index: false, follow: true },
  };
}

const SORT_TABS: [Orden, string][] = [
  ["destacados", "Más votados"],
  ["nuevos", "Nuevos"],
  ["ahorro", "Mayor ahorro"],
  ["comentados", "Comentados"],
  ["caducan", "Caducan pronto"],
];

const sortHref = (slug: string, orden: Orden) => (orden === "destacados" ? `/tiendas/${slug}` : `/tiendas/${slug}?orden=${orden}`);

export default async function StorePage({ params, searchParams }: PageProps<"/tiendas/[slug]">) {
  const found = await load((await params).slug);
  const sp = await searchParams;
  const rawOrden = sp.orden;
  const orden = ordenOf(typeof rawOrden === "string" ? rawOrden : "");
  if (!found) notFound();
  const { store, all, coupons } = found;
  const [client, mine] = await Promise.all([siteClient(), currentVotes()]);
  // where its clicks count: a campaign's utm_source, or this store page (the SEO landing for "<store> códigos")
  const source = pageSource(sp, "tienda");
  const now = new Date();
  const { iso: today } = madridToday(now);
  const time = now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
  const base = siteUrl();
  const guide = storeGuide(store.slug);
  // the store's own FAQs (panel) win; a store with none borrows its guide's
  const ownFaqs = parseFaqs(store.faqs);
  const faqs = ownFaqs.length ? ownFaqs : (guide?.faqs ?? []);
  const codes = coupons.filter((c) => c.kind === "code" && c.code).length;
  const verified = coupons.filter((c) => c.verified).length;
  const best = [...coupons].sort((a, b) => percentOf(b.discount) - percentOf(a.discount) || b.verified - a.verified)[0];
  const sorted = sortDeals(coupons, orden);
  const facts = factsOf(store.facts);
  const cat = categoryOf(store.category);
  const domain = store.website.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  const crumbs = [{ name: "Inicio", href: "/" }, { name: "Tiendas", href: "/tiendas" }, { name: store.name }];
  const title = storeH1(store.name, coupons, now);

  // other stores of the same category first, then the ones with the most coupons
  const counts = new Map<string, { name: string; slug: string; n: number; same: boolean }>();
  for (const c of all)
    if (c.store_id !== store.id)
      counts.set(c.store_slug, { name: c.store_name, slug: c.store_slug, n: (counts.get(c.store_slug)?.n ?? 0) + 1, same: !!store.category && c.store_category === store.category });
  const otherStores = [...counts.values()].sort((a, b) => Number(b.same) - Number(a.same) || b.n - a.n).slice(0, 6);
  const otherTitle = cat && otherStores.some((s) => s.same) ? `Otras tiendas de ${cat.label.toLowerCase()}` : "Otras tiendas con cupones";

  return (
    <main>
      <JsonLd data={crumbsLd(base, crumbs)} />
      {sorted.length > 0 && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: title,
            numberOfItems: sorted.length,
            itemListElement: sorted.map((c, i) => ({ "@type": "ListItem", position: i + 1, item: offerLd(base, c) })),
          }}
        />
      )}
      {faqs.length > 0 && <JsonLd data={faqLd(faqs)} />}

      <div className="wrap">
        {cat && <MarkHeaderCategory slug={cat.slug} />}
        <Crumbs items={crumbs} />
        <section className="store-hero">
          <div className="tile">
            <StoreBrand slug={store.slug} name={store.name} hasLogo={store.has_logo} hasWordmark={store.has_wordmark} />
          </div>
          <div>
          <h1 data-seo="H1 con intención">{title}</h1>
          <div className="meta-line">
            <span className="live">Actualizado a las {time}</span>
            <span>{coupons.length === 1 ? "1 cupón activo" : `${coupons.length} cupones activos`}</span>
            {domain && <span>{domain}</span>}
          </div>
          <p className="answer" data-seo="Respuesta citable (GEO)">
            {coupons.length ? (
              <>
                Hoy hay <strong>{coupons.length} {coupons.length === 1 ? "cupón activo" : "cupones activos"}</strong> de {store.name}, {codes} con código y {coupons.length - codes} sin código. {verified === 1 ? "1 está comprobado" : `${verified} están comprobados`}.
                {best && percentOf(best.discount) > 0 && (
                  <>
                    {" "}El mayor porcentaje es <strong>{badgeInSentence(badgeOf(best))}</strong>
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
          </div>
        </section>

        <div className="grid">
          <section id="chollos" aria-labelledby="storeDeals">
            <h2 id="storeDeals" className="feed-title">Ofertas de {store.name}</h2>
            {sorted.length > 1 && (
              <div className="toolbar">
                <nav className="tabs" aria-label="Orden">
                  {SORT_TABS.map(([k, label]) => (
                    <Link key={k} href={sortHref(store.slug, k)} aria-current={orden === k ? "page" : undefined}>
                      {label}
                    </Link>
                  ))}
                </nav>
              </div>
            )}
            {sorted.length ? (
              <div className="feed">
                {sorted.map((c) => (
                  <DealCard key={c.id} c={c} client={client} today={today} now={now} mine={mine} next={sortHref(store.slug, orden)} hideStore source={source} />
                ))}
              </div>
            ) : (
              <div className="panel">
                <h3>No hay cupones activos de {store.name} hoy</h3>
                <p className="small">
                  Publicamos cupones nuevos cada día. Mientras tanto, <Link href="/">mira los chollos de otras tiendas</Link>.
                </p>
              </div>
            )}
          </section>
          <aside className="rail">
            {facts.length > 0 ? (
              <section className="panel">
                <h2>Datos de {store.name}</h2>
                <StoreFacts text={store.facts} />
              </section>
            ) : (
              <section className="panel">
                <h2>{store.name} en cifras</h2>
                <ul className="stores">
                  <li><span>Cupones activos<small>{coupons.length}</small></span></li>
                  <li><span>Con código<small>{codes}</small></span></li>
                  <li><span>Comprobados<small>{verified}</small></span></li>
                </ul>
              </section>
            )}
            {otherStores.length > 0 && (
              <section className="panel" data-seo="Enlazado interno a tiendas">
                <h2>{otherTitle}</h2>
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
                <Link href="/tiendas" className="small">Ver todas las tiendas</Link>
              </section>
            )}
          </aside>
        </div>
      </div>

      {(store.intro.trim() || guide || faqs.length > 0) && (
        <div className="longform">
          <div className="wrap">
            {store.intro.trim() && (
              <section className="two" data-seo="Texto único por tienda">
                <div className="section-head">
                  <h2>Lo que conviene saber de {store.name}</h2>
                </div>
                <p className="lead">{store.intro}</p>
              </section>
            )}
            {guide && (
              <section className="two" data-seo="Guía de la tienda">
                <div className="section-head">
                  <h2>Cómo conseguir un {guide.keyword}</h2>
                  <p>Lo que conviene saber antes de usar un cupón de {store.name}.</p>
                </div>
                <div className="prose">
                  {!store.intro.trim() && <p className="lead">{guide.lead}</p>}
                  {guide.sections.map((s) => (
                    <section key={s.heading} className="prose">
                      <h3>{s.heading}</h3>
                      {s.paragraphs.map((p, i) => (
                        <p key={i}>{p}</p>
                      ))}
                      {s.steps && (
                        <ol className="steps">
                          {s.steps.map((step, i) => (
                            <li key={i}>{step}</li>
                          ))}
                        </ol>
                      )}
                    </section>
                  ))}
                  <p className="small">
                    Cómo comprobamos cada código: <Link href="/metodologia">metodología de CuponLab</Link>.
                  </p>
                </div>
              </section>
            )}
            {faqs.length > 0 && (
              <section className="two">
                <div className="section-head">
                  <h2>Preguntas sobre los descuentos de {store.name}</h2>
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
