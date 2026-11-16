import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { categoryOf } from "@/lib/catalog";
import { pageSource } from "@/lib/click-signals";
import { sortDeals } from "@/lib/community";
import { EVENT_PAGES, eventDeals, eventEdition, eventPageOf, storeEventPath } from "@/lib/event-pages";
import { currentVotes, nearFirstPageStores, siteClient, siteCoupons } from "@/lib/public-site";
import { daysBetween, longDate, madridToday, siteUrl } from "@/lib/site-text";
import { Crumbs, DealCard, Faqs, JsonLd, crumbsLd, faqLd, offerLd } from "../../site-ui";
import { withoutPerks } from "@/lib/perks";

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const when = (iso: string) => `${WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()]} ${longDate(iso)}`;
const MAX_DEALS = 30;
const MAX_FALLBACK = 12;
const MAX_STORES = 24;

export async function generateMetadata({ params }: PageProps<"/ofertas/[evento]">): Promise<Metadata> {
  const e = eventPageOf((await params).evento);
  if (!e) return { title: "Página no encontrada", robots: { index: false } };
  const { year, date } = eventEdition(e, madridToday().iso);
  return {
    title: { absolute: `Ofertas ${e.name} ${year}: chollos y códigos descuento | CuponLab` },
    description: `${e.name} ${year} es el ${longDate(date)}. Los chollos y códigos descuento de ${e.what} activos, con su fecha de caducidad y si están comprobados.`,
    alternates: { canonical: `/ofertas/${e.slug}` },
  };
}

// One evergreen page per shopping date (src/lib/event-pages.ts): the same URL every year, this year's date and deals
export default async function EventPage({ params, searchParams }: PageProps<"/ofertas/[evento]">) {
  const e = eventPageOf((await params).evento);
  if (!e) notFound();
  const sp = await searchParams;
  const [all, client, mine, near] = await Promise.all([siteCoupons().then(withoutPerks), siteClient(), currentVotes(), nearFirstPageStores()]);
  const now = new Date();
  const { iso: today } = madridToday(now);
  const { year, date, ends } = eventEdition(e, today);
  const left = daysBetween(today, date);
  const { matched, fallback } = eventDeals(e, all, today);
  const shown = matched.length ? sortDeals(matched, "destacados").slice(0, MAX_DEALS) : sortDeals(fallback, "ahorro").slice(0, MAX_FALLBACK);
  const source = pageSource(sp, "evento");
  const base = siteUrl();
  const path = `/ofertas/${e.slug}`;
  const crumbs = [{ name: "Inicio", href: "/" }, { name: "Calendario de ofertas", href: "/calendario" }, { name: `${e.name} ${year}` }];
  const catLabels = e.categories.map((s) => categoryOf(s)?.label.toLowerCase()).filter(Boolean) as string[];
  const fallbackWhat = catLabels.length ? `de ${catLabels.length > 1 ? `${catLabels.slice(0, -1).join(", ")} y ${catLabels[catLabels.length - 1]}` : catLabels[0]}` : "de todas las tiendas";
  const faqs = e.faqs(longDate(date), year);
  // this date in each store (/ofertas/<event>/<store>): pages close to Google's first page first, then the most coupons
  const nearRank = new Map(near.map((n, i) => [n.slug, i]));
  const perStore = new Map<string, { name: string; slug: string; n: number }>();
  for (const c of all) perStore.set(c.store_slug, { name: c.store_name, slug: c.store_slug, n: (perStore.get(c.store_slug)?.n ?? 0) + 1 });
  const stores = [...perStore.values()]
    .sort((a, b) => (nearRank.get(a.slug) ?? 1e9) - (nearRank.get(b.slug) ?? 1e9) || b.n - a.n)
    .slice(0, MAX_STORES);
  const others = EVENT_PAGES.filter((x) => x.slug !== e.slug)
    .map((x) => ({ x, ed: eventEdition(x, today) }))
    .sort((a, b) => a.ed.date.localeCompare(b.ed.date))
    .slice(0, 6);

  const status =
    left > 0 ? (
      <>Faltan <strong>{left === 1 ? "1 día" : `${left} días`}</strong>.</>
    ) : today <= ends ? (
      <><strong>{left === 0 ? "Es hoy" : "Las ofertas siguen activas"}</strong>.</>
    ) : null;

  return (
    <main>
      <JsonLd data={crumbsLd(base, crumbs)} />
      <JsonLd data={faqLd(faqs)} />
      {shown.length > 0 && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: `Ofertas ${e.name} ${year}`,
            numberOfItems: shown.length,
            itemListElement: shown.map((c, i) => ({ "@type": "ListItem", position: i + 1, item: offerLd(base, c) })),
          }}
        />
      )}
      <div className="wrap">
        <Crumbs items={crumbs} />
        <section className="intro is-sub">
          <h1 data-seo="H1 con intención + año">Ofertas {e.name} {year}: chollos y códigos descuento</h1>
          <p className="answer" data-seo="Respuesta citable (GEO)">
            {e.name} {year} es el <strong>{when(date)}</strong>. {status}{" "}
            {matched.length ? (
              <>Hoy hay <strong>{matched.length === 1 ? "1 chollo" : `${matched.length} chollos`} de {e.name}</strong> activos en CuponLab.</>
            ) : (
              <>Todavía no hay chollos marcados como {e.name}; mientras tanto, abajo tienes los de mayor descuento {fallbackWhat}.</>
            )}
          </p>
        </section>

        <section id="chollos" aria-labelledby="eventDeals">
          <h2 id="eventDeals" className="feed-title">
            {matched.length ? `Chollos de ${e.name}` : `Mientras tanto: mayores descuentos ${fallbackWhat}`}
          </h2>
          {shown.length ? (
            <div className="feed">
              {shown.map((c) => (
                <DealCard key={c.id} c={c} client={client} today={today} now={now} mine={mine} next={path} source={source} />
              ))}
            </div>
          ) : (
            <div className="panel">
              <h3>No hay chollos activos ahora mismo</h3>
              <p className="small">
                Publicamos cupones nuevos cada día. <Link href="/">Mira los chollos de hoy</Link>.
              </p>
            </div>
          )}
        </section>
      </div>

      <div className="longform">
        <div className="wrap">
          <section className="two" data-seo="Guía del evento">
            <div className="section-head">
              <h2>Lo que conviene saber de {e.name}</h2>
            </div>
            <div className="prose">
              <p className="lead">{e.lead(when(date), year)}</p>
              {e.sections.map((s) => (
                <section key={s.heading} className="prose">
                  <h3>{s.heading}</h3>
                  {s.paragraphs.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </section>
              ))}
              <h3>Consejos para ahorrar</h3>
              <ol className="steps">
                {e.tips.map((t, i) => (
                  <li key={i}>
                    <span>{t}</span>
                  </li>
                ))}
              </ol>
              <p className="small">
                Cómo comprobamos cada código: <Link href="/metodologia">metodología de CuponLab</Link>.
              </p>
            </div>
          </section>
          <section className="two">
            <div className="section-head">
              <h2>Preguntas sobre {e.name}</h2>
            </div>
            <Faqs items={faqs} />
          </section>
          {stores.length > 0 && (
            <nav aria-label={`${e.name} por tienda`} data-seo="Enlazado interno tienda + evento">
              <div className="section-head">
                <h2>{e.name} {year} por tienda</h2>
              </div>
              <ul className="stores">
                {stores.map((st) => (
                  <li key={st.slug}>
                    <Link href={storeEventPath(e.slug, st.slug)}>
                      {e.name} {st.name}
                      <small>{st.n === 1 ? "1 cupón" : `${st.n} cupones`}</small>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          <nav aria-label="Otras fechas de ofertas" data-seo="Enlazado interno entre eventos">
            <div className="section-head">
              <h2>Otras fechas de ofertas</h2>
            </div>
            <ul className="stores">
              {others.map(({ x, ed }) => (
                <li key={x.slug}>
                  <Link href={`/ofertas/${x.slug}`}>
                    Ofertas {x.name} {ed.year}
                    <small>{longDate(ed.date)}</small>
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/calendario" className="small">Ver el calendario completo</Link>
          </nav>
        </div>
      </div>
    </main>
  );
}
