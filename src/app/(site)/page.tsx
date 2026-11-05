import type { Metadata } from "next";
import Link from "next/link";
import { siteClient, siteCoupons, storeGuides, type SiteCoupon } from "@/lib/public-site";
import { blackFriday, daysBetween, longDate, madridToday, percentOf, siteUrl, upcomingEvents } from "@/lib/site-text";
import { Crumbs, DealCard, Faqs, JsonLd, badgeOf, faqLd, offerLd } from "./site-ui";

export const metadata: Metadata = {
  title: { absolute: "Chollos y códigos descuento verificados hoy | CuponLab" },
  description: "Los chollos y códigos descuento activos hoy en tiendas españolas, comprobados por personas, con condiciones claras y fecha de caducidad.",
  alternates: { canonical: "/" },
};

const PER_PAGE = 30;
const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

type Filters = { tipo: "todos" | "codigos" | "ofertas"; orden: "destacados" | "nuevos" | "caducan"; comprobados: boolean; q: string; pagina: number };

function readFilters(sp: Record<string, string | string[] | undefined>): Filters {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const tipo = one("tipo") === "codigos" || one("tipo") === "ofertas" ? (one("tipo") as Filters["tipo"]) : "todos";
  const orden = one("orden") === "nuevos" || one("orden") === "caducan" ? (one("orden") as Filters["orden"]) : "destacados";
  return { tipo, orden, comprobados: one("comprobados") === "1", q: one("q").trim().slice(0, 80), pagina: Math.max(1, Number.parseInt(one("pagina"), 10) || 1) };
}

const hrefWith = (f: Filters, change: Partial<Filters>) => {
  const n = { ...f, pagina: 1, ...change };
  const q = new URLSearchParams();
  if (n.q) q.set("q", n.q);
  if (n.tipo !== "todos") q.set("tipo", n.tipo);
  if (n.orden !== "destacados") q.set("orden", n.orden);
  if (n.comprobados) q.set("comprobados", "1");
  if (n.pagina > 1) q.set("pagina", String(n.pagina));
  const s = q.toString();
  return s ? `/?${s}` : "/";
};

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function sortDeals(list: SiteCoupon[], orden: Filters["orden"]) {
  const byId = (a: SiteCoupon, b: SiteCoupon) => b.id - a.id;
  if (orden === "nuevos") return [...list].sort(byId);
  if (orden === "caducan") return [...list].sort((a, b) => (a.expires_at || "9999").localeCompare(b.expires_at || "9999") || byId(a, b));
  // destacados: checked by a person first, then the biggest discount, then the newest
  return [...list].sort((a, b) => b.verified - a.verified || percentOf(b.discount) - percentOf(a.discount) || byId(a, b));
}

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const f = readFilters(await searchParams);
  const [all, client] = await Promise.all([siteCoupons(), siteClient()]);
  const now = new Date();
  const { iso: today, words: todayWords } = madridToday(now);
  const time = now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });

  const byStore = new Map<number, { name: string; slug: string; count: number }>();
  for (const c of all) {
    const s = byStore.get(c.store_id) ?? { name: c.store_name, slug: c.store_slug, count: 0 };
    s.count++;
    byStore.set(c.store_id, s);
  }
  const topStores = [...byStore.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 8);
  const guides = (await storeGuides(topStores.map(([id]) => id)))
    .sort((a, b) => (byStore.get(b.id)?.count ?? 0) - (byStore.get(a.id)?.count ?? 0))
    .slice(0, 3);

  const codes = all.filter((c) => c.kind === "code").length;
  const verified = all.filter((c) => c.verified).length;
  const soon = all.filter((c) => c.expires_at && daysBetween(today, c.expires_at) <= 7).length;
  const best = [...all].sort((a, b) => percentOf(b.discount) - percentOf(a.discount) || b.verified - a.verified)[0];
  const bestCode = all.filter((c) => c.kind === "code" && c.code).sort((a, b) => percentOf(b.discount) - percentOf(a.discount) || b.verified - a.verified)[0];

  const needle = fold(f.q);
  const filtered = all.filter(
    (c) =>
      (f.tipo === "codigos" ? c.kind === "code" : f.tipo === "ofertas" ? c.kind === "deal" : true) &&
      (!f.comprobados || c.verified) &&
      (!needle || fold(`${c.store_name} ${c.title} ${c.code} ${c.description}`).includes(needle)),
  );
  const sorted = sortDeals(filtered, f.orden);
  const pages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const page = Math.min(f.pagina, pages);
  const shown = sorted.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const bf = blackFriday(Number(today.slice(0, 4)));
  const toBf = daysBetween(today, bf);
  const faqs = [
    { q: "¿Cómo sé si un código sigue activo?", a: "Cada cupón muestra su fecha de caducidad y si lo ha comprobado una persona. Los cupones caducados desaparecen de la portada en cuanto pasa su fecha." },
    { q: "¿Se pueden acumular dos códigos descuento?", a: "Casi nunca: la mayoría de tiendas admiten un solo código por pedido. Lo que sí suele acumularse es un código con productos que ya están rebajados, salvo que las condiciones del cupón digan lo contrario." },
    { q: "¿CuponLab cobra por usar los códigos?", a: "No. Algunos enlaces son de afiliado: si compras, la tienda nos paga una comisión. Tu precio es el mismo y la comisión no cambia el orden de los chollos." },
    { q: `¿Cuándo es el Black Friday ${bf.slice(0, 4)}?`, a: `El Black Friday ${bf.slice(0, 4)} es el ${longDate(bf)} y el Cyber Monday, tres días después. Muchas tiendas españolas adelantan ofertas durante toda esa semana.` },
  ];
  const base = siteUrl();
  const sortTabs = [
    ["destacados", "Destacados"],
    ["nuevos", "Nuevos"],
    ["caducan", "Caducan pronto"],
  ] as const;

  return (
    <main>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "WebSite", name: "CuponLab", url: base }} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: `Chollos y códigos descuento verificados, ${todayWords}`,
          numberOfItems: all.length,
          itemListElement: sortDeals(all, "destacados").slice(0, 20).map((c, i) => ({ "@type": "ListItem", position: i + 1, item: offerLd(base, c) })),
        }}
      />
      <JsonLd data={faqLd(faqs)} />

      <div className="wrap">
        <Crumbs items={[{ name: "Inicio", href: "/" }, { name: "Chollos de hoy" }]} />

        <section className="intro">
          <h1>Chollos y códigos descuento verificados hoy, {todayWords}</h1>
          <div className="meta-line">
            <span className="live">Actualizado a las {time}</span>
            <span>Los cupones caducados se retiran solos</span>
            <span>Por el equipo editorial de CuponLab</span>
          </div>
          <p className="answer">
            Hoy hay <strong>{all.length} cupones activos</strong> en {byStore.size} tiendas: {codes} códigos descuento y {all.length - codes} ofertas sin código, {verified} comprobados por el equipo.
            {best && percentOf(best.discount) > 0 && (
              <>
                {" "}El mayor descuento es <strong>{badgeOf(best)} en {best.store_name}</strong>
                {best.expires_at ? <>, válido hasta el {longDate(best.expires_at)}</> : null}.
              </>
            )}
            {bestCode && bestCode.id !== best?.id && percentOf(bestCode.discount) > 0 && (
              <>
                {" "}Con código, <strong>{bestCode.code}</strong> da un {badgeOf(bestCode)} en {bestCode.store_name}.
              </>
            )}
            {soon > 0 && <> {soon} caducan en los próximos 7 días.</>}
          </p>
        </section>

        <div className="grid">
          <section aria-labelledby="feedTitle">
            <h2 id="feedTitle" className="feed-title">
              {f.q ? `Resultados para «${f.q}»` : f.tipo === "codigos" ? "Códigos descuento de hoy" : f.tipo === "ofertas" ? "Ofertas sin código de hoy" : "Chollos de hoy"}
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
                  <DealCard key={c.id} c={c} client={client} today={today} />
                ))}
              </div>
            ) : (
              <p className="empty">
                No hay cupones activos {f.q ? <>para «{f.q}»</> : "con este filtro"} ahora mismo. <Link href="/">Ver todos los chollos</Link>
              </p>
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
              <section className="panel">
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
                <Link href="/tiendas">Ver las {byStore.size} tiendas</Link>
              </section>
            )}
            <section className="panel">
              <h2>Calendario de ofertas</h2>
              <ul className="cal">
                {upcomingEvents(today).map((e) => (
                  <li key={e.date} className={daysBetween(today, e.date) <= 30 ? "soon" : undefined}>
                    <span className="d">
                      <b>{Number(e.date.slice(8))}</b>
                      <small>{MONTHS_SHORT[Number(e.date.slice(5, 7)) - 1]}</small>
                    </span>
                    <span>
                      <strong>{e.name}</strong>
                      <br />
                      <span className="small">{e.note}</span>
                    </span>
                  </li>
                ))}
              </ul>
              {toBf >= 0 && toBf <= 60 && <p className="small">Quedan {toBf} días para el Black Friday.</p>}
              <Link href="/calendario">Ver el calendario completo</Link>
            </section>
            <p className="small">Algunos enlaces son de afiliado. Si compras, la tienda nos paga una comisión y tu precio no cambia. Las comisiones no influyen en el orden de los chollos.</p>
          </aside>
        </div>
      </div>

      <div className="longform">
        <div className="wrap">
          <section className="two">
            <div className="section-head">
              <h2>Cómo comprobamos cada cupón</h2>
              <p>Un cupón solo sale en CuponLab si se puede usar hoy. Esto es lo que hacemos antes de publicarlo y mientras sigue activo.</p>
            </div>
            <ol className="steps">
              <li>
                <span>
                  <strong>Lo traemos de la red de afiliación o de la tienda</strong>La mayoría llegan directamente de Awin, CJ, Rakuten y otras redes, con sus condiciones oficiales.
                </span>
              </li>
              <li>
                <span>
                  <strong>Una persona lo revisa</strong>Los cupones marcados como «Comprobado» los ha revisado alguien del equipo. Los encontrados en la web no se publican hasta que alguien los comprueba.
                </span>
              </li>
              <li>
                <span>
                  <strong>Lo retiramos cuando caduca</strong>El día después de su fecha de caducidad desaparece de la portada y su página pasa a «Caducado».
                </span>
              </li>
            </ol>
          </section>

          {guides.length > 0 && (
            <section>
              <div className="section-head" style={{ marginBottom: 14 }}>
                <h2>Lo que conviene saber antes de usar un código</h2>
              </div>
              <div className="store-guides">
                {guides.map((g) => (
                  <article key={g.id} className="guide">
                    <h3>Códigos descuento {g.name}</h3>
                    <p>{g.intro}</p>
                    <Link href={`/tiendas/${g.slug}`}>
                      Ver los {byStore.get(g.id)?.count} cupones de {g.name}
                    </Link>
                  </article>
                ))}
              </div>
            </section>
          )}

          <section className="two">
            <div className="section-head">
              <h2>Dudas sobre chollos y códigos</h2>
              <p>Si tu duda es sobre una tienda concreta, la respuesta suele estar en su página.</p>
            </div>
            <Faqs items={faqs} />
          </section>

          <div className="author">
            <span className="av" aria-hidden="true">CL</span>
            <div>
              <p>
                <strong>Equipo editorial de CuponLab</strong>
              </p>
              <p>
                Página revisada el {todayWords}. Los cupones caducados se retiran solos y los encontrados en la web los comprueba una persona antes de publicarlos.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
