import { pageSource } from "@/lib/click-signals";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { parseFaqs } from "@/lib/affiliate";
import { categoryOf, categoryPath, factsOf, ordenOf, type Orden } from "@/lib/catalog";
import { BRANDS, brandPath } from "@/lib/brands";
import { sortDeals } from "@/lib/community";
import { badgeInSentence, storeH1, storeHeading } from "@/lib/deal-text";
import { currentVotes, nearFirstPageStores, siteClient, siteCoupons, siteRecentlyExpired, siteStore } from "@/lib/public-site";
import { dealPath, longDate, madridToday, percentOf, shortDate, siteUrl } from "@/lib/site-text";
import { storeGuide } from "@/lib/store-guides";
import { eventEdition, storeEventPath, storeEventsInSeason } from "@/lib/event-pages";
import { checkedLabel, isPerk, lastChecked } from "@/lib/perks";
import { storeUsesLabel } from "@/lib/usage-signals";
import { publishedGuide } from "@/lib/store-guides-db";
import { publishedGuides } from "@/lib/guide-index";
import { relatedGuides } from "@/lib/seo-auto";
import { MarkHeaderCategory } from "../../site-header";
import { StoreBrand } from "../../store-logo-img";
import { Crumbs, DealCard, Faqs, JsonLd, StoreFacts, badgeOf, crumbsLd, faqLd, offerLd, titleOf } from "../../site-ui";

async function load(slug: string) {
  const store = await siteStore(slug);
  if (!store) return undefined;
  const [all, expiredAll] = await Promise.all([siteCoupons(), siteRecentlyExpired()]);
  return { store, all, coupons: all.filter((c) => c.store_id === store.id), expired: expiredAll.filter((c) => c.store_id === store.id) };
}

const EXPIRED_SHOWN = 6;

export async function generateMetadata({ params }: PageProps<"/tiendas/[slug]">): Promise<Metadata> {
  const found = await load((await params).slug);
  if (!found) return { title: "Tienda no encontrada", robots: { index: false } };
  const { store, coupons, expired } = found;
  // «cupones» are the store's coupons and offers; its standing offers (newsletter, app…) are counted apart, as everywhere
  const regular = coupons.filter((c) => !isPerk(c));
  const perks = coupons.length - regular.length;
  const codes = regular.filter((c) => c.kind === "code" && c.code).length;
  const checked = lastChecked(coupons.filter((c) => c.verified));
  const guide = storeGuide(store.slug) ?? (await publishedGuide(store.id));
  const now = new Date();
  return {
    // with nothing live the title names no figures: the discounts it would quote are gone
    title: { absolute: `${coupons.length ? storeHeading(store.name, coupons, now, store.title_term) : storeH1(store.name, expired, now, store.title_term)} | CuponLab` },
    description: coupons.length
      ? guide
        ? guide.description
        : regular.length
          ? `${regular.length === 1 ? "1 cupón activo" : `${regular.length} cupones activos`} de ${store.name} (${codes === 1 ? "1 código descuento" : `${codes} códigos descuento`})${perks ? ` y ${perks === 1 ? "1 descuento permanente" : `${perks} descuentos permanentes`}` : ""}, con condiciones y fecha de caducidad.${checked ? ` Última comprobación: ${shortDate(checked)}.` : ""}`
          : `${perks === 1 ? "1 descuento permanente" : `${perks} descuentos permanentes`} de ${store.name}, con sus condiciones.${checked ? ` Última comprobación: ${shortDate(checked)}.` : ""}`
      : `Hoy no hay cupones activos de ${store.name}. Los últimos códigos y ofertas que publicamos, cuándo caducaron y lo que conviene saber antes de comprar.`,
    alternates: { canonical: `/tiendas/${store.slug}` },
    // the URL stays in the index while the store has live coupons, a guide, or coupons that expired in the last months
    // (dropping it each time its coupons run out would throw away what it ranks for); a store that never had any stays out
    robots: coupons.length || expired.length || guide ? undefined : { index: false, follow: true },
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
  const { store, all, coupons, expired } = found;
  const [client, mine, near] = await Promise.all([siteClient(), currentVotes(), nearFirstPageStores()]);
  const nearRank = new Map(near.map((n, i) => [n.slug, i]));
  const boost = (slug: string) => nearRank.get(slug) ?? Number.MAX_SAFE_INTEGER;
  // where its clicks count: a campaign's utm_source, or this store page (the SEO landing for "<store> códigos")
  const source = pageSource(sp, "tienda");
  const now = new Date();
  const { iso: today } = madridToday(now);
  const time = now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
  const base = siteUrl();
  // hand-written (store-guides.ts) first, else the automatic one once published (guides-cron.ts)
  const guide = storeGuide(store.slug) ?? (await publishedGuide(store.id));
  // links between guides (automatic for every published one): same category first, then the freshest
  const guides = guide ? await publishedGuides() : [];
  const guideMeta = guides.find((g) => g.slug === store.slug);
  const moreGuides = guide ? relatedGuides(guides, store.slug, store.category, 4) : [];
  // the store's own FAQs (panel) win; a store with none borrows its guide's
  const ownFaqs = parseFaqs(store.faqs);
  const faqs = ownFaqs.length ? ownFaqs : (guide?.faqs ?? []);
  // standing offers (newsletter, app…) get their own block under the coupons, and are counted apart from them
  const perks = coupons.filter(isPerk);
  const regular = coupons.filter((c) => !isPerk(c));
  // real uses of its live coupons in the last 7 days, "" under the minimum (see usage-signals.ts)
  const uses = storeUsesLabel(coupons);
  const codes = regular.filter((c) => c.kind === "code" && c.code).length;
  const verified = regular.filter((c) => c.verified).length;
  const best = [...(regular.length ? regular : coupons)].sort((a, b) => percentOf(b.discount) - percentOf(a.discount) || b.verified - a.verified)[0];
  const sorted = sortDeals(regular, orden);
  const perksPhrase = perks.length === 1 ? "1 descuento permanente" : `${perks.length} descuentos permanentes`;
  const checked = lastChecked(coupons.filter((c) => c.verified));
  // this store on the shopping dates coming up (/ofertas/black-friday/<store>)
  const seasonEvents = storeEventsInSeason(today);
  const facts = factsOf(store.facts);
  const cat = categoryOf(store.category);
  const domain = store.website.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  // through its category when it has one (Inicio › Moda › Tienda): links every store page to its category page
  const crumbs = [{ name: "Inicio", href: "/" }, cat ? { name: cat.label, href: categoryPath(cat.slug) } : { name: "Tiendas", href: "/tiendas" }, { name: store.name }];
  const title = storeH1(store.name, coupons.length ? coupons : expired, now, store.title_term);
  const lastExpired = expired.slice(0, EXPIRED_SHOWN);

  // other stores of the same category first, then the ones with the most coupons
  const counts = new Map<string, { name: string; slug: string; n: number; same: boolean }>();
  for (const c of all)
    if (c.store_id !== store.id && !isPerk(c))
      counts.set(c.store_slug, { name: c.store_name, slug: c.store_slug, n: (counts.get(c.store_slug)?.n ?? 0) + 1, same: !!store.category && c.store_category === store.category });
  // same category first; within it, pages close to Google's first page (nearFirstPageStores), then the most coupons
  const otherStores = [...counts.values()].sort((a, b) => Number(b.same) - Number(a.same) || boost(a.slug) - boost(b.slug) || b.n - a.n).slice(0, 6);
  const otherTitle = cat && otherStores.some((s) => s.same) ? `Otras tiendas de ${cat.label.toLowerCase()}` : "Otras tiendas con cupones";
  // the brands of its live deals (/marcas pages), most deals first; its own brand (the Nike shop's Nike) leads
  const brandCount = new Map<string, number>();
  for (const c of regular) for (const b of c.brand_slugs) brandCount.set(b, (brandCount.get(b) ?? 0) + 1);
  const storeBrands = BRANDS.filter((b) => brandCount.has(b.slug)).sort((a, b) => brandCount.get(b.slug)! - brandCount.get(a.slug)!).slice(0, 8);

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
      {guide && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "Article",
            headline: `Cómo conseguir un ${guide.keyword}`,
            description: guide.description,
            ...(guideMeta?.updatedAt ? { dateModified: guideMeta.updatedAt.toISOString() } : {}),
            mainEntityOfPage: `${base}/tiendas/${store.slug}`,
            about: { "@type": "Organization", name: store.name, url: store.website },
            author: { "@type": "Organization", name: "CuponLab", url: base },
            publisher: { "@type": "Organization", name: "CuponLab", url: base },
          }}
        />
      )}

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
            {checked ? <span className="live">Última comprobación: {checkedLabel(checked, today).replace(/^Comprobado /, "")}</span> : <span className="live">Actualizado a las {time}</span>}
            <span>{regular.length === 1 ? "1 cupón activo" : `${regular.length} cupones activos`}</span>
            {uses && <span>{uses}</span>}
            {domain && <span>{domain}</span>}
          </div>
          <p className="answer" data-seo="Respuesta citable (GEO)">
            {regular.length ? (
              <>
                Hoy hay <strong>{regular.length} {regular.length === 1 ? "cupón activo" : "cupones activos"}</strong> de {store.name}, {codes} con código y {regular.length - codes} sin código. {verified === 1 ? "1 está comprobado" : `${verified} están comprobados`}.
                {perks.length > 0 && <> Además tiene <strong>{perksPhrase}</strong>.</>}
                {best && percentOf(best.discount) > 0 && (
                  <>
                    {" "}El mayor porcentaje es <strong>{badgeInSentence(badgeOf(best))}</strong>
                    {best.kind === "code" && best.code ? <> con el código <strong>{best.code}</strong></> : null}
                    {best.expires_at ? <>, válido hasta el {longDate(best.expires_at)}</> : null}.
                  </>
                )}
              </>
            ) : perks.length ? (
              <>
                Ahora mismo no hay cupones de {store.name} con fecha, pero tiene <strong>{perksPhrase}</strong>.
              </>
            ) : (
              <>
                Ahora mismo no hay cupones activos de {store.name}.
                {lastExpired[0] ? <> El último caducó el {longDate(lastExpired[0].expires_at)}.</> : null} Lo revisamos a diario: vuelve pronto o mira los <Link href="/">chollos de hoy</Link>.
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
            ) : perks.length ? null : (
              <div className="panel">
                <h3>No hay cupones activos de {store.name} hoy</h3>
                <p className="small">
                  Publicamos cupones nuevos cada día. Mientras tanto, <Link href="/">mira los chollos de otras tiendas</Link>.
                </p>
              </div>
            )}
            {perks.length > 0 && (
              <section aria-labelledby="storePerks" data-seo="Ofertas permanentes">
                <h2 id="storePerks" className="feed-title">Descuentos que {store.name} tiene todo el año</h2>
                <div className="feed">
                  {perks.map((c) => (
                    <DealCard key={c.id} c={c} client={client} today={today} now={now} mine={mine} next={sortHref(store.slug, orden)} hideStore source={source} />
                  ))}
                </div>
              </section>
            )}
            {lastExpired.length > 0 && (
              <section className="panel" aria-labelledby="storeExpired" data-seo="Últimos cupones caducados">
                <h2 id="storeExpired">Últimos cupones de {store.name} caducados</h2>
                <p className="small">Ya no funcionan: te los dejamos para que sepas qué descuentos suele dar {store.name}.</p>
                <ul className="stores">
                  {lastExpired.map((c) => (
                    <li key={c.id}>
                      <Link href={dealPath(c)}>
                        {titleOf(c)}
                        <small>Caducó el {longDate(c.expires_at)}</small>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
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
                  <li><span>Cupones activos<small>{regular.length}</small></span></li>
                  <li><span>Con código<small>{codes}</small></span></li>
                  <li><span>Comprobados<small>{verified}</small></span></li>
                  {perks.length > 0 && <li><span>Descuentos permanentes<small>{perks.length}</small></span></li>}
                </ul>
              </section>
            )}
            {seasonEvents.length > 0 && (
              <section className="panel" data-seo="Enlazado interno tienda + evento">
                <h2>Próximas fechas de ofertas</h2>
                <ul className="stores">
                  {seasonEvents.map((e) => (
                    <li key={e.slug}>
                      <Link href={storeEventPath(e.slug, store.slug)}>
                        {e.name} {store.name}
                        <small>{longDate(eventEdition(e, today).date)}</small>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {storeBrands.length > 0 && (
              <section className="panel" data-seo="Enlazado interno tienda → marcas">
                <h2>Marcas en oferta en {store.name}</h2>
                <ul className="stores">
                  {storeBrands.map((b) => (
                    <li key={b.slug}>
                      <Link href={brandPath(b.slug)}>
                        Ofertas de {b.name}
                        <small>{brandCount.get(b.slug)} en {store.name}</small>
                      </Link>
                    </li>
                  ))}
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
                    {guideMeta?.updatedAt && <>Guía actualizada el {guideMeta.updatedAt.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" })}. </>}
                    Cómo comprobamos cada código: <Link href="/metodologia">metodología de CuponLab</Link>.
                  </p>
                  {moreGuides.length > 0 && (
                    <nav aria-label="Más guías de ahorro" data-seo="Enlazado interno entre guías">
                      <h3>Más guías de ahorro</h3>
                      <ul>
                        {moreGuides.map((g) => (
                          <li key={g.slug}><Link href={`/tiendas/${g.slug}`}>{g.keyword.charAt(0).toUpperCase() + g.keyword.slice(1)}</Link></li>
                        ))}
                      </ul>
                    </nav>
                  )}
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
