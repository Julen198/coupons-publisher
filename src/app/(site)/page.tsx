import { pageSource } from "@/lib/click-signals";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { sortDeals } from "@/lib/community";
import { categoryOf, emptyFeedText, hasStoreGuide, homeHref, ordenOf, type HomeFilters } from "@/lib/catalog";
import { currentVotes, siteClient, siteCoupons, storeGuides } from "@/lib/public-site";
import { getReader } from "@/lib/reader";
import { guideLabels } from "@/lib/store-list";
import { badgeInSentence } from "@/lib/deal-text";
import { blackFriday, daysBetween, longDate, madridToday, monthShort, percentOf, siteUrl, upcomingEvents } from "@/lib/site-text";
import { Crumbs, DealCard, Faqs, JsonLd, StoreFacts, badgeOf, faqLd, offerLd } from "./site-ui";

// A category page has its own title and canonical; a search page stays out of the index
export async function generateMetadata({ searchParams }: PageProps<"/">): Promise<Metadata> {
  const f = readFilters(await searchParams);
  const cat = categoryOf(f.cat);
  if (f.q) return { title: { absolute: `Chollos y códigos para «${f.q}» | CuponLab` }, robots: { index: false, follow: true } };
  if (cat)
    return {
      title: { absolute: `Chollos de ${cat.label} verificados hoy | CuponLab` },
      description: `Los chollos y códigos descuento de ${cat.label} activos hoy en tiendas españolas, cada uno con su fecha de caducidad y si está comprobado.`,
      alternates: { canonical: `/?cat=${cat.slug}` },
    };
  return {
    title: { absolute: "Chollos y códigos descuento verificados hoy | CuponLab" },
    description: "Los chollos y códigos descuento activos hoy en tiendas españolas, cada uno con su fecha de caducidad y si está comprobado.",
    alternates: { canonical: "/" },
  };
}

const PER_PAGE = 30;
const RAIL_STORES = 6;

type Filters = HomeFilters;

function readFilters(sp: Record<string, string | string[] | undefined>): Filters {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const tipo = one("tipo") === "codigos" || one("tipo") === "ofertas" ? (one("tipo") as Filters["tipo"]) : "todos";
  const orden = ordenOf(one("orden"));
  return { cat: categoryOf(one("cat"))?.slug ?? "", tipo, orden, comprobados: one("comprobados") === "1", q: one("q").trim().slice(0, 80), pagina: Math.max(1, Number.parseInt(one("pagina"), 10) || 1) };
}

const hrefWith = homeHref;

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// The page reads the database, so it streams behind its own boundary: the layout's Suspense does not
// cover a navigation between two filters of this same route (/?cat=moda -> /?cat=hogar)
export default function HomePage(props: PageProps<"/">) {
  return (
    <Suspense fallback={<main className="wrap"><p className="crumbs">Cargando chollos…</p></main>}>
      <HomeContent {...props} />
    </Suspense>
  );
}

async function HomeContent({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const f = readFilters(sp);
  // where its clicks count: a campaign's utm_source, or the home page
  const source = pageSource(sp, "portada");
  const [all, client, mine, reader] = await Promise.all([siteCoupons(), siteClient(), currentVotes(), getReader()]);
  const now = new Date();
  const { iso: today, words: todayWords } = madridToday(now);
  const time = now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });

  const cat = categoryOf(f.cat);
  const needle = fold(f.q);
  // a category or a search scopes the intro, the rail and the feed; "tipo" and "comprobados" only narrow the feed
  const scope = all.filter((c) => (!f.cat || c.store_category === f.cat) && (!needle || fold(`${c.store_name} ${c.title} ${c.code} ${c.description}`).includes(needle)));
  const byStore = new Map<number, { name: string; slug: string; count: number; codes: number }>();
  for (const c of scope) {
    const s = byStore.get(c.store_id) ?? { name: c.store_name, slug: c.store_slug, count: 0, codes: 0 };
    s.count++;
    if (c.kind === "code") s.codes++;
    byStore.set(c.store_id, s);
  }
  const topStores = [...byStore.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, RAIL_STORES);
  const guides = (await storeGuides(topStores.map(([id]) => id)))
    .filter(hasStoreGuide)
    .sort((a, b) => (byStore.get(b.id)?.count ?? 0) - (byStore.get(a.id)?.count ?? 0))
    .slice(0, 3);

  const allStores = new Set(all.map((c) => c.store_id)).size;
  const codes = scope.filter((c) => c.kind === "code").length;
  const verified = scope.filter((c) => c.verified).length;
  const soon = scope.filter((c) => c.expires_at && daysBetween(today, c.expires_at) <= 7).length;
  const best = [...scope].sort((a, b) => percentOf(b.discount) - percentOf(a.discount) || b.verified - a.verified)[0];
  const bestCode = scope.filter((c) => c.kind === "code" && c.code).sort((a, b) => percentOf(b.discount) - percentOf(a.discount) || b.verified - a.verified)[0];

  const pageName = f.q ? `Resultados para «${f.q}»` : cat ? `Chollos de ${cat.label}` : "Chollos de hoy";
  const heading = f.q ? `Chollos y códigos para «${f.q}»` : cat ? `Chollos de ${cat.label} verificados hoy, ${todayWords}` : `Chollos y códigos descuento verificados hoy, ${todayWords}`;
  const stores = (n: number) => (n === 1 ? "1 tienda" : `${n} tiendas`);
  const filtered = scope.filter(
    (c) => (f.tipo === "codigos" ? c.kind === "code" : f.tipo === "ofertas" ? c.kind === "deal" : true) && (!f.comprobados || c.verified),
  );
  const sorted = sortDeals(filtered, f.orden);
  const pages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const page = Math.min(f.pagina, pages);
  const shown = sorted.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const empty = emptyFeedText(f, cat?.label ?? "");

  const bf = blackFriday(Number(today.slice(0, 4)));
  const faqs = [
    { q: "¿Cómo sé si un código sigue activo?", a: "Cada cupón muestra su fecha de caducidad y si está comprobado. Los cupones caducados desaparecen de la portada en cuanto pasa su fecha." },
    { q: "¿Se pueden acumular dos códigos descuento?", a: "Casi nunca. La mayoría de tiendas admiten un solo código por pedido. Lo que sí suele acumularse es un código con productos que ya están rebajados, salvo que las condiciones del cupón digan lo contrario." },
    { q: "¿CuponLab cobra por usar los códigos?", a: "No. Algunos enlaces son de afiliado. Si compras, la tienda nos paga una comisión. Tu precio es el mismo y la comisión no cambia el orden de los chollos." },
    { q: `¿Cuándo es el Black Friday ${bf.slice(0, 4)}?`, a: `El Black Friday ${bf.slice(0, 4)} es el ${longDate(bf)} y el Cyber Monday, tres días después. Muchas tiendas españolas adelantan ofertas durante toda esa semana.` },
  ];
  const base = siteUrl();
  const sortTabs = [
    ["destacados", "Más votados"],
    ["nuevos", "Nuevos"],
    ["ahorro", "Mayor ahorro"],
    ["comentados", "Comentados"],
    ["caducan", "Caducan pronto"],
  ] as const;

  return (
    <main>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "WebSite", name: "CuponLab", url: base }} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "CuponLab",
          url: base,
          logo: `${base}/icon.svg`,
          description: "Chollos y códigos descuento verificados de tiendas españolas, cada uno con su fecha de caducidad.",
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: heading,
          numberOfItems: scope.length,
          itemListElement: sortDeals(scope, "destacados").slice(0, 20).map((c, i) => ({ "@type": "ListItem", position: i + 1, item: offerLd(base, c) })),
        }}
      />
      <JsonLd data={faqLd(faqs)} />

      <div className="wrap">
        <Crumbs seo="Migas de pan" items={[{ name: "Inicio", href: "/" }, { name: "Chollos", href: "/" }, { name: pageName }]} />

        <section className="intro">
          <h1 data-seo="H1 con intención + fecha">{heading}</h1>
          <div className="meta-line">
            <span className="live">Actualizado a las {time}</span>
            <span>Los cupones caducados salen de la portada al día siguiente</span>
            <span>Por el equipo editorial de CuponLab</span>
          </div>
          <p className="answer" data-seo="Respuesta citable (GEO)">
            {scope.length === 0 ? (
              f.q ? <>No hay cupones activos para «{f.q}» ahora mismo.</> : cat ? <>Ahora mismo no hay cupones activos en {cat.label}.</> : <>Ahora mismo no hay cupones activos.</>
            ) : (
              <>
                {f.q ? (
                  <>Hay <strong>{scope.length === 1 ? "1 cupón activo" : `${scope.length} cupones activos`}</strong> para «{f.q}» en {stores(byStore.size)}</>
                ) : (
                  <>Hoy hay <strong>{scope.length === 1 ? "1 cupón activo" : `${scope.length} cupones activos`}</strong>{cat ? <> de {cat.label}</> : null} en {stores(byStore.size)}</>
                )}
                . De ellos, {codes} {codes === 1 ? "es código descuento" : "son códigos descuento"} y {scope.length - codes} {scope.length - codes === 1 ? "oferta" : "ofertas"} sin código, y {verified} {verified === 1 ? "está comprobado" : "están comprobados"}.
              </>
            )}
            {best && percentOf(best.discount) > 0 && (
              <>
                {" "}El mayor descuento es <strong>{badgeInSentence(badgeOf(best))} en {best.store_name}</strong>
                {best.expires_at ? <>, válido hasta el {longDate(best.expires_at)}</> : null}.
              </>
            )}
            {bestCode && bestCode.id !== best?.id && percentOf(bestCode.discount) > 0 && (
              <>
                {" "}Con código, <strong>{bestCode.code}</strong> da un {badgeInSentence(badgeOf(bestCode))} en {bestCode.store_name}.
              </>
            )}
            {soon > 0 && <> {soon} caducan en los próximos 7 días.</>}
          </p>
        </section>

        <div className="grid">
          <section id="chollos" aria-labelledby="feedTitle">
            <h2 id="feedTitle" className="feed-title">
              {f.q ? `Resultados para «${f.q}»` : cat ? pageName : f.tipo === "codigos" ? "Códigos descuento de hoy" : f.tipo === "ofertas" ? "Ofertas sin código de hoy" : "Chollos de hoy"}
            </h2>
            <div className="toolbar">
              <nav className="tabs" aria-label="Orden">
                {sortTabs.map(([k, label]) => (
                  <Link key={k} href={hrefWith(f, { orden: k })} aria-current={f.orden === k ? "page" : undefined}>
                    {label}
                  </Link>
                ))}
              </nav>
              <Link className="chip" href={hrefWith(f, { comprobados: !f.comprobados })} aria-current={f.comprobados ? "page" : undefined}>
                <span className="box" aria-hidden="true" /> Solo comprobados
              </Link>
            </div>
            {shown.length ? (
              <div className="feed">
                {shown.map((c) => (
                  <DealCard key={c.id} c={c} client={client} today={today} now={now} mine={mine} next={hrefWith(f, { pagina: f.pagina })} viewerHandle={reader?.handle} source={source} />
                ))}
              </div>
            ) : (
              <div className="panel">
                <h3>{empty.title}</h3>
                <p className="small">
                  {empty.hint}
                  {empty.link && (
                    <>
                      {" "}<Link href={empty.link.href}>{empty.link.label}</Link>.
                    </>
                  )}
                </p>
              </div>
            )}
            {pages > 1 && (
              <nav className="pager" aria-label="Paginación">
                {page > 1 ? <Link href={hrefWith(f, { pagina: page - 1 })}>← Anteriores</Link> : <span />}
                <span className="small">Página {page} de {pages}</span>
                {page < pages ? <Link href={hrefWith(f, { pagina: page + 1 })}>Más chollos →</Link> : <span />}
              </nav>
            )}
          </section>

          <aside className="rail">
            {topStores.length > 0 && (
              <section className="panel" data-seo="Enlazado interno a tiendas">
                <h2>Tiendas con más cupones</h2>
                <ul className="stores">
                  {topStores.map(([id, st]) => (
                    <li key={id}>
                      <Link href={`/tiendas/${st.slug}`}>
                        {st.name}
                        <small>
                          {st.count} {st.count === 1 ? "cupón" : "cupones"}
                        </small>
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link href="/tiendas" className="small">Ver las {allStores} tiendas</Link>
              </section>
            )}
            <section className="panel" data-seo="Contenido estacional">
              <h2>Calendario de ofertas</h2>
              <ul className="cal">
                {upcomingEvents(today).map((e) => (
                  <li key={e.date} className={e.date === bf ? "soon" : undefined}>
                    <span className="d">
                      <b>{Number(e.date.slice(8))}</b>
                      <small>{monthShort(Number(e.date.slice(5, 7)))}</small>
                    </span>
                    <span>
                      <strong>{e.name}</strong>
                      <br />
                      <span className="small">{e.note}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <Link href="/calendario" className="small">Ver el calendario completo</Link>
            </section>
            <p className="small" data-seo="Aviso de afiliación">Algunos enlaces son de afiliado. Si compras, la tienda nos paga una comisión y tu precio no cambia. Las comisiones no influyen en el orden de los chollos.</p>
          </aside>
        </div>
      </div>

      <div className="longform">
        <div className="wrap">
          <section className="two" data-seo="Metodología (E-E-A-T)">
            <div className="section-head">
              <h2>Cómo comprobamos cada cupón</h2>
              <p>Un cupón solo sale en CuponLab si se puede usar hoy. Esto es lo que hacemos antes de publicarlo y mientras sigue activo.</p>
            </div>
            <ol className="steps">
              <li>
                <span>
                  <strong>Lo traemos de la red de afiliación o de la tienda</strong>La mayoría llegan de Awin, CJ, Rakuten e Impact con las condiciones que fija la tienda.
                </span>
              </li>
              <li>
                <span>
                  <strong>Viene de la red o lo revisa una persona</strong>Los cupones de las redes de afiliación llegan con las condiciones oficiales de la tienda y salen como «Comprobado». Los que encontramos en la web no los publicamos hasta que alguien del equipo los comprueba.
                </span>
              </li>
              <li>
                <span>
                  <strong>Lo retiramos cuando caduca</strong>El día después de su fecha de caducidad desaparece de la portada y su página pasa a «Caducado».
                </span>
              </li>
              <li>
                <span>
                  <strong>La comunidad vota y comenta</strong>Los votos ordenan «Más votados». El equipo puede ocultar comentarios y bloquear cuentas que no respetan las normas.
                </span>
              </li>
            </ol>
          </section>

          {guides.length > 0 && (
            <section data-seo="Texto único por tienda">
              <div className="section-head" style={{ marginBottom: 14 }}>
                <h2>Lo que conviene saber antes de usar un código</h2>
              </div>
              <div className="store-guides">
                {guides.map((g) => {
                  const labels = guideLabels(g.name, byStore.get(g.id)?.count ?? 0, byStore.get(g.id)?.codes ?? 0);
                  return (
                    <article key={g.id} className="guide">
                      <h3>{labels.heading}</h3>
                      <StoreFacts text={g.facts} />
                      {g.intro && <p>{g.intro}</p>}
                      <Link href={`/tiendas/${g.slug}`}>{labels.link}</Link>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          <section className="two">
            <div className="section-head">
              <h2>Dudas sobre chollos y códigos</h2>
              <p>Si tu pregunta no está aquí, déjala en los comentarios de cualquier oferta y la respondemos.</p>
            </div>
            <Faqs items={faqs} />
          </section>

          <div className="author" data-seo="Autoría y fecha de revisión">
            <span className="av" aria-hidden="true">CL</span>
            <div>
              <p>
                <strong>Equipo editorial de CuponLab</strong>
              </p>
              <p>
                Datos actualizados el {todayWords}. Publicamos los cupones de las redes de afiliación y los que encontramos en la web después de que los revise una persona. <Link href="/metodologia">Cómo elegimos las ofertas</Link>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
