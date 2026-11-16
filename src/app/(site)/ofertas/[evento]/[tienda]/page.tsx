import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { factsOf } from "@/lib/catalog";
import { pageSource } from "@/lib/click-signals";
import { sortDeals } from "@/lib/community";
import { badgeInSentence } from "@/lib/deal-text";
import { RETURNS, eventDeals, eventEdition, eventPageOf, storeEventIndexable, storeEventPath } from "@/lib/event-pages";
import { isPerk } from "@/lib/perks";
import { currentVotes, nearFirstPageStores, siteClient, siteCoupons, siteStore } from "@/lib/public-site";
import { daysBetween, longDate, madridToday, percentOf, siteUrl } from "@/lib/site-text";
import { Crumbs, DealCard, Faqs, JsonLd, StoreFacts, badgeOf, crumbsLd, faqLd, offerLd, titleOf } from "../../../site-ui";

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const when = (iso: string) => `${WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()]} ${longDate(iso)}`;
const OTHER_STORES = 8;

async function load(evento: string, tienda: string) {
  const e = eventPageOf(evento);
  if (!e) return undefined;
  let slug = tienda;
  try {
    slug = decodeURIComponent(tienda);
  } catch {
    return undefined;
  }
  const store = await siteStore(slug);
  if (!store) return undefined;
  const all = await siteCoupons();
  const live = all.filter((c) => c.store_id === store.id);
  return { e, store, all, live, regular: live.filter((c) => !isPerk(c)), perks: live.filter(isPerk) };
}

export async function generateMetadata({ params }: PageProps<"/ofertas/[evento]/[tienda]">): Promise<Metadata> {
  const p = await params;
  const found = await load(p.evento, p.tienda);
  if (!found) return { title: "Página no encontrada", robots: { index: false } };
  const { e, store, live } = found;
  const { year, date } = eventEdition(e, madridToday().iso);
  const codes = live.filter((c) => c.kind === "code" && c.code).length;
  return {
    title: { absolute: `${e.name} ${store.name} ${year}: código descuento y ofertas | CuponLab` },
    description: live.length
      ? `Códigos descuento y ofertas de ${store.name} para ${e.name} ${year} (${longDate(date)}): ${live.length === 1 ? "1 activo" : `${live.length} activos`} hoy, ${codes} con código, con sus condiciones y su fecha de caducidad.`
      : `${e.name} ${year} es el ${longDate(date)}. Hoy no hay cupones activos de ${store.name}: publicamos sus códigos en cuanto salen.`,
    alternates: { canonical: storeEventPath(e.slug, store.slug) },
    // without live coupons of its own the page would be the event's text with another name: kept out of the index
    robots: storeEventIndexable(live.length) ? undefined : { index: false, follow: true },
  };
}

// A store on a shopping date: «Black Friday Myprotein». Its coupons that name the event; while there are none, all of
// its live ones. Everything said here comes from its coupons and the store's own data (Datos de la tienda).
export default async function StoreEventPage({ params, searchParams }: PageProps<"/ofertas/[evento]/[tienda]">) {
  const p = await params;
  const found = await load(p.evento, p.tienda);
  if (!found) notFound();
  const { e, store, all, live, regular, perks } = found;
  const sp = await searchParams;
  const [client, mine, near] = await Promise.all([siteClient(), currentVotes(), nearFirstPageStores()]);
  const now = new Date();
  const { iso: today } = madridToday(now);
  const { year, date, ends } = eventEdition(e, today);
  const left = daysBetween(today, date);
  const { matched } = eventDeals(e, regular, today);
  const shown = sortDeals(matched.length ? matched : regular, "destacados");
  const codes = live.filter((c) => c.kind === "code" && c.code).length;
  const best = [...shown].sort((a, b) => percentOf(b.discount) - percentOf(a.discount) || b.verified - a.verified)[0];
  const source = pageSource(sp, "evento");
  const base = siteUrl();
  const path = storeEventPath(e.slug, store.slug);
  const eventName = `${e.name} ${year}`;
  const crumbs = [{ name: "Inicio", href: "/" }, { name: `Ofertas ${eventName}`, href: `/ofertas/${e.slug}` }, { name: store.name }];
  const facts = factsOf(store.facts);
  const returns = facts.find((f) => f.label.toLowerCase().startsWith("devoluc"));

  // other stores on the same date: same category first, then pages close to Google's first page, then the most coupons
  const nearRank = new Map(near.map((n, i) => [n.slug, i]));
  const counts = new Map<string, { name: string; slug: string; n: number; same: boolean }>();
  for (const c of all)
    if (c.store_id !== store.id && !isPerk(c))
      counts.set(c.store_slug, { name: c.store_name, slug: c.store_slug, n: (counts.get(c.store_slug)?.n ?? 0) + 1, same: !!store.category && c.store_category === store.category });
  const others = [...counts.values()]
    .sort((a, b) => Number(b.same) - Number(a.same) || (nearRank.get(a.slug) ?? 1e9) - (nearRank.get(b.slug) ?? 1e9) || b.n - a.n)
    .slice(0, OTHER_STORES);

  const status = left > 0 ? `Faltan ${left === 1 ? "1 día" : `${left} días`}.` : today <= ends ? (left === 0 ? "Es hoy." : "Las ofertas siguen activas.") : "";
  const faqs = [
    {
      q: `¿Hay código descuento de ${store.name} para ${eventName}?`,
      a: matched.length
        ? `Sí. Hoy hay ${matched.length === 1 ? "1 cupón" : `${matched.length} cupones`} de ${store.name} para ${e.name}${best && percentOf(best.discount) > 0 ? `; el mayor es de ${badgeInSentence(badgeOf(best))}` : ""}. Cada uno indica sus condiciones y hasta cuándo vale.`
        : live.length
          ? `Todavía no hemos visto ninguno que mencione ${e.name}. Mientras tanto ${store.name} tiene ${live.length === 1 ? "1 cupón activo" : `${live.length} cupones activos`}, ${codes} con código, y en cuanto la tienda publique los de ${e.name} los añadimos aquí.`
          : `Ahora mismo no hay cupones activos de ${store.name}. Revisamos la tienda a diario y los publicamos aquí en cuanto salen.`,
    },
    e.faqs(longDate(date), year)[0],
    {
      q: `¿Puedo devolver lo que compre en ${store.name} durante ${e.name}?`,
      a: returns ? `Según las condiciones de ${store.name}: ${returns.value}. ${RETURNS}` : RETURNS,
    },
    ...(perks.length
      ? [{ q: `¿Qué descuentos tiene ${store.name} todo el año?`, a: `${perks.map((c) => titleOf(c)).join(". ")}. Suelen poder usarse también durante ${e.name}, salvo que la tienda diga lo contrario.` }]
      : []),
  ];

  return (
    <main>
      <JsonLd data={crumbsLd(base, crumbs)} />
      <JsonLd data={faqLd(faqs)} />
      {shown.length > 0 && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: `${e.name} ${store.name} ${year}`,
            numberOfItems: shown.length,
            itemListElement: shown.map((c, i) => ({ "@type": "ListItem", position: i + 1, item: offerLd(base, c) })),
          }}
        />
      )}
      <div className="wrap">
        <Crumbs items={crumbs} />
        <section className="intro is-sub">
          <h1 data-seo="H1 tienda + evento + año">{e.name} {store.name} {year}: código descuento y ofertas</h1>
          <p className="answer" data-seo="Respuesta citable (GEO)">
            {e.name} {year} es el <strong>{when(date)}</strong>. {status}{" "}
            {matched.length ? (
              <>
                Hoy hay <strong>{matched.length === 1 ? "1 cupón" : `${matched.length} cupones`} de {store.name} para {e.name}</strong>
                {best && percentOf(best.discount) > 0 ? <>, el mayor de <strong>{badgeInSentence(badgeOf(best))}</strong></> : null}.
              </>
            ) : live.length ? (
              <>
                Todavía no hay cupones de {store.name} que mencionen {e.name}; mientras tanto, {live.length === 1 ? <>este es su <strong>único cupón activo</strong></> : <>estos son sus <strong>{live.length} cupones activos</strong></>}.
              </>
            ) : (
              <>Hoy no hay cupones activos de {store.name}: los publicamos aquí en cuanto salen.</>
            )}
          </p>
        </section>

        <section id="chollos" aria-labelledby="storeEventDeals">
          <h2 id="storeEventDeals" className="feed-title">
            {matched.length ? `Cupones de ${store.name} para ${e.name}` : `Cupones activos de ${store.name}`}
          </h2>
          {shown.length ? (
            <div className="feed">
              {shown.map((c) => (
                <DealCard key={c.id} c={c} client={client} today={today} now={now} mine={mine} next={path} hideStore source={source} />
              ))}
            </div>
          ) : (
            <div className="panel">
              <h3>No hay cupones activos de {store.name} hoy</h3>
              <p className="small">
                Mira la <Link href={`/tiendas/${store.slug}`}>página de {store.name}</Link> o los <Link href={`/ofertas/${e.slug}`}>chollos de {e.name}</Link> de otras tiendas.
              </p>
            </div>
          )}
          {perks.length > 0 && (
            <section aria-labelledby="storeEventPerks" data-seo="Ofertas permanentes">
              <h2 id="storeEventPerks" className="feed-title">Descuentos que {store.name} tiene todo el año</h2>
              <div className="feed">
                {perks.map((c) => (
                  <DealCard key={c.id} c={c} client={client} today={today} now={now} mine={mine} next={path} hideStore source={source} />
                ))}
              </div>
            </section>
          )}
        </section>
      </div>

      <div className="longform">
        <div className="wrap">
          <section className="two" data-seo="Guía tienda + evento">
            <div className="section-head">
              <h2>{e.name} en {store.name}: lo que conviene saber</h2>
            </div>
            <div className="prose">
              <p className="lead">{e.lead(when(date), year)}</p>
              {facts.length > 0 && (
                <>
                  <h3>Datos de {store.name}</h3>
                  <StoreFacts text={store.facts} />
                </>
              )}
              <h3>Consejos para ahorrar</h3>
              <ol className="steps">
                {e.tips.map((t, i) => (
                  <li key={i}>
                    <span>{t}</span>
                  </li>
                ))}
              </ol>
              <p className="small">
                Todos los cupones de la tienda: <Link href={`/tiendas/${store.slug}`}>código descuento {store.name}</Link>. Cómo comprobamos cada código: <Link href="/metodologia">metodología de CuponLab</Link>.
              </p>
            </div>
          </section>
          <section className="two">
            <div className="section-head">
              <h2>Preguntas sobre {e.name} en {store.name}</h2>
            </div>
            <Faqs items={faqs} />
          </section>
          {others.length > 0 && (
            <nav aria-label={`${e.name} en otras tiendas`} data-seo="Enlazado interno tienda + evento">
              <div className="section-head">
                <h2>{e.name} en otras tiendas</h2>
              </div>
              <ul className="stores">
                {others.map((s) => (
                  <li key={s.slug}>
                    <Link href={storeEventPath(e.slug, s.slug)}>
                      {e.name} {s.name}
                      <small>{s.n === 1 ? "1 cupón" : `${s.n} cupones`}</small>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href={`/ofertas/${e.slug}`} className="small">Ver todos los chollos de {e.name}</Link>
            </nav>
          )}
        </div>
      </div>
    </main>
  );
}
