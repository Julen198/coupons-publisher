import type { Metadata } from "next";
import Link from "next/link";
import { siteClient, siteCoupons, storeGuides, type SiteCoupon } from "@/lib/public-site";
import { blackFriday, daysBetween, longDate, madridToday, percentOf, siteUrl, upcomingEvents } from "@/lib/site-text";
import { DealCard, Faqs, JsonLd, badgeOf, faqLd, offerLd } from "./site-ui";

export const metadata: Metadata = {
  title: { absolute: "Chollos y códigos descuento verificados hoy | CuponLab" },
  description: "Los chollos y códigos descuento activos hoy en tiendas españolas, comprobados por personas, con condiciones claras y fecha de caducidad.",
  alternates: { canonical: "/" },
};

const PER_PAGE = 30;
const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

type Filters = { tipo: "todos" | "codigos" | "ofertas"; orden: "destacados" | "nuevos" | "caducan"; pagina: number };

function readFilters(sp: Record<string, string | string[] | undefined>): Filters {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const tipo = one("tipo") === "codigos" || one("tipo") === "ofertas" ? (one("tipo") as Filters["tipo"]) : "todos";
  const orden = one("orden") === "nuevos" || one("orden") === "caducan" ? (one("orden") as Filters["orden"]) : "destacados";
  const pagina = Math.max(1, Number.parseInt(one("pagina"), 10) || 1);
  return { tipo, orden, pagina };
}

const hrefWith = (f: Filters, change: Partial<Filters>) => {
  const n = { ...f, pagina: 1, ...change };
  const q = new URLSearchParams();
  if (n.tipo !== "todos") q.set("tipo", n.tipo);
  if (n.orden !== "destacados") q.set("orden", n.orden);
  if (n.pagina > 1) q.set("pagina", String(n.pagina));
  const s = q.toString();
  return s ? `/?${s}` : "/";
};

function sortDeals(list: SiteCoupon[], orden: Filters["orden"]) {
  const byId = (a: SiteCoupon, b: SiteCoupon) => b.id - a.id;
  if (orden === "nuevos") return [...list].sort(byId);
  if (orden === "caducan")
    return [...list].sort((a, b) => (a.expires_at || "9999").localeCompare(b.expires_at || "9999") || byId(a, b));
  // destacados: checked by a person first, then the biggest discount, then the newest
  return [...list].sort((a, b) => b.verified - a.verified || percentOf(b.discount) - percentOf(a.discount) || byId(a, b));
}

// The two sentences an answer engine can quote: how many, where, and the best one, with today's date
function summary(all: SiteCoupon[], stores: number, today: string) {
  const codes = all.filter((c) => c.kind === "code").length;
  const soon = all.filter((c) => c.expires_at && daysBetween(today, c.expires_at) <= 7).length;
  const best = [...all].sort((a, b) => percentOf(b.discount) - percentOf(a.discount) || b.verified - a.verified)[0];
  return { codes, soon, best: best && percentOf(best.discount) > 0 ? best : undefined, stores };
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
  const guides = (await storeGuides(topStores.map(([id]) => id))).sort(
    (a, b) => (byStore.get(b.id)?.count ?? 0) - (byStore.get(a.id)?.count ?? 0),
  ).slice(0, 3);
  const s = summary(all, byStore.size, today);

  const filtered = all.filter((c) => (f.tipo === "codigos" ? c.kind === "code" : f.tipo === "ofertas" ? c.kind === "deal" : true));
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
    {
      q: `¿Cuándo es el Black Friday ${bf.slice(0, 4)}?`,
      a: `El Black Friday ${bf.slice(0, 4)} es el ${longDate(bf)} y el Cyber Monday, tres días después. Muchas tiendas españolas adelantan ofertas durante toda esa semana.`,
    },
  ];

  const base = siteUrl();
  const tab = (active: boolean) =>
    `rounded px-3 py-1.5 text-sm font-semibold ${active ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white" : "text-slate-600 hover:text-slate-900 dark:text-slate-300"}`;

  return (
    <main className="mx-auto max-w-6xl px-4">
      <JsonLd data={{ "@context": "https://schema.org", "@type": "WebSite", name: "CuponLab", url: base }} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: `Chollos y códigos descuento verificados, ${todayWords}`,
          numberOfItems: all.length,
          itemListElement: sorted.slice(0, 20).map((c, i) => ({ "@type": "ListItem", position: i + 1, item: offerLd(base, c) })),
        }}
      />
      <JsonLd data={faqLd(faqs)} />

      <section className="grid gap-3 py-6">
        <h1 className="max-w-3xl text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">Chollos y códigos descuento verificados hoy, {todayWords}</h1>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-400">
          <span className="font-semibold text-green-700 dark:text-green-400">Actualizado a las {time}</span>
          <span>Por el equipo editorial de CuponLab</span>
        </p>
        <p className="max-w-3xl text-[17px] leading-relaxed text-slate-700 dark:text-slate-300">
          Hoy hay <strong className="text-slate-900 dark:text-white">{all.length} cupones activos</strong> en {s.stores} tiendas: {s.codes} códigos descuento y {all.length - s.codes} ofertas sin código.
          {s.soon > 0 && <> {s.soon} caducan en los próximos 7 días.</>}
          {s.best && (
            <>
              {" "}El mayor descuento es <strong className="text-slate-900 dark:text-white">{badgeOf(s.best)} en {s.best.store_name}</strong>
              {s.best.expires_at ? <>, válido hasta el {longDate(s.best.expires_at)}</> : null}.
            </>
          )}
        </p>
      </section>

      <div className="grid items-start gap-6 pb-12 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section aria-labelledby="deals" className="min-w-0">
          <h2 id="deals" className="mb-3 text-lg font-bold">Chollos de hoy</h2>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <nav aria-label="Orden" className="flex flex-wrap gap-1 rounded-md bg-slate-200/70 p-1 dark:bg-slate-800">
              <Link href={hrefWith(f, { orden: "destacados" })} className={tab(f.orden === "destacados")}>Destacados</Link>
              <Link href={hrefWith(f, { orden: "nuevos" })} className={tab(f.orden === "nuevos")}>Nuevos</Link>
              <Link href={hrefWith(f, { orden: "caducan" })} className={tab(f.orden === "caducan")}>Caducan pronto</Link>
            </nav>
            <nav aria-label="Tipo" className="flex gap-3 text-sm">
              {(["todos", "codigos", "ofertas"] as const).map((t) => (
                <Link key={t} href={hrefWith(f, { tipo: t })} aria-current={f.tipo === t ? "page" : undefined} className={f.tipo === t ? "font-bold text-blue-700 dark:text-blue-400" : "text-slate-600 hover:underline dark:text-slate-400"}>
                  {t === "todos" ? "Todos" : t === "codigos" ? "Con código" : "Sin código"}
                </Link>
              ))}
            </nav>
          </div>
          {shown.length ? (
            <div className="grid gap-3">
              {shown.map((c) => (
                <DealCard key={c.id} c={c} client={client} today={today} />
              ))}
            </div>
          ) : (
            <p className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              No hay cupones activos con este filtro ahora mismo. <Link href="/" className="font-semibold text-blue-700 hover:underline dark:text-blue-400">Ver todos los chollos</Link>
            </p>
          )}
          {pages > 1 && (
            <nav aria-label="Paginación" className="mt-4 flex items-center justify-between text-sm">
              {page > 1 ? <Link href={hrefWith(f, { pagina: page - 1 })} className="font-semibold text-blue-700 hover:underline dark:text-blue-400">← Anteriores</Link> : <span />}
              <span className="text-slate-500">Página {page} de {pages}</span>
              {page < pages ? <Link href={hrefWith(f, { pagina: page + 1 })} className="font-semibold text-blue-700 hover:underline dark:text-blue-400">Más chollos →</Link> : <span />}
            </nav>
          )}
        </section>

        <aside className="grid gap-4">
          {topStores.length > 0 && (
            <section className="grid gap-2 rounded-md border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="font-bold">Tiendas con más cupones</h2>
              <ul className="grid">
                {topStores.map(([id, st]) => (
                  <li key={id}>
                    <Link href={`/tiendas/${st.slug}`} className="flex justify-between gap-3 rounded px-1.5 py-1.5 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800">
                      {st.name}
                      <span className="font-normal text-slate-500 tabular-nums">{st.count} {st.count === 1 ? "cupón" : "cupones"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href="/tiendas" className="text-sm font-semibold text-blue-700 hover:underline dark:text-blue-400">Ver las {byStore.size} tiendas</Link>
            </section>
          )}
          <section className="grid gap-3 rounded-md border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="font-bold">Calendario de ofertas</h2>
            <ul className="grid gap-3">
              {upcomingEvents(today).map((e) => {
                const soon = daysBetween(today, e.date) <= 30;
                return (
                  <li key={e.date} className="grid grid-cols-[48px_1fr] items-center gap-3 text-sm">
                    <span className={`rounded border py-1 text-center leading-tight tabular-nums ${soon ? "border-orange-600 text-orange-700 dark:text-orange-400" : "border-slate-300 dark:border-slate-700"}`}>
                      <b className="block text-lg">{Number(e.date.slice(8))}</b>
                      <small className="text-[10px] uppercase tracking-wide">{MONTHS_SHORT[Number(e.date.slice(5, 7)) - 1]}</small>
                    </span>
                    <span>
                      <strong>{e.name}</strong>
                      <br />
                      <span className="text-xs text-slate-500 dark:text-slate-400">{e.note}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
            {toBf >= 0 && toBf <= 60 && <p className="text-xs text-slate-500 dark:text-slate-400">Quedan {toBf} días para el Black Friday.</p>}
            <Link href="/calendario" className="text-sm font-semibold text-blue-700 hover:underline dark:text-blue-400">Ver el calendario completo</Link>
          </section>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Algunos enlaces son de afiliado. Si compras, la tienda nos paga una comisión y tu precio no cambia. Las comisiones no influyen en el orden de los chollos.
          </p>
        </aside>
      </div>

      <div className="grid gap-12 border-t border-slate-200 py-12 dark:border-slate-800">
        <section className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="grid content-start gap-2">
            <h2 className="text-2xl font-bold">Cómo comprobamos cada cupón</h2>
            <p className="text-slate-600 dark:text-slate-400">Un cupón solo sale en CuponLab si se puede usar hoy. Esto es lo que hacemos antes de publicarlo y mientras sigue activo.</p>
          </div>
          <ol className="grid gap-4">
            {[
              ["Lo traemos de la red de afiliación o de la tienda", "La mayoría llegan directamente de Awin, CJ, Rakuten y otras redes, con sus condiciones oficiales."],
              ["Una persona lo revisa", "Los cupones marcados como «Comprobado» los ha revisado alguien del equipo. Los encontrados en la web no se publican hasta que alguien los comprueba."],
              ["Lo retiramos cuando caduca", "El día después de su fecha de caducidad desaparece de la portada y su página pasa a «Caducado»."],
            ].map(([title, text], i) => (
              <li key={i} className="grid grid-cols-[32px_1fr] gap-3">
                <span className="grid size-8 place-items-center rounded-full bg-blue-100 font-bold text-blue-800 dark:bg-blue-950 dark:text-blue-300">{i + 1}</span>
                <span className="text-slate-600 dark:text-slate-400">
                  <strong className="block text-slate-900 dark:text-white">{title}</strong>
                  {text}
                </span>
              </li>
            ))}
          </ol>
        </section>

        {guides.length > 0 && (
          <section className="grid gap-4">
            <h2 className="text-2xl font-bold">Lo que conviene saber antes de usar un código</h2>
            <div className="grid gap-4 md:grid-cols-3">
              {guides.map((g) => (
                <article key={g.id} className="grid content-start gap-2 rounded-md border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="font-bold">Códigos descuento {g.name}</h3>
                  <p className="line-clamp-6 text-sm text-slate-600 dark:text-slate-400">{g.intro}</p>
                  <Link href={`/tiendas/${g.slug}`} className="text-sm font-semibold text-blue-700 hover:underline dark:text-blue-400">
                    Ver los {byStore.get(g.id)?.count} cupones de {g.name}
                  </Link>
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="grid content-start gap-2">
            <h2 className="text-2xl font-bold">Dudas sobre chollos y códigos</h2>
          </div>
          <Faqs items={faqs} />
        </section>

        <section className="flex items-start gap-4 rounded-md border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-blue-100 font-extrabold text-blue-800 dark:bg-blue-950 dark:text-blue-300">CL</span>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            <strong className="block text-base text-slate-900 dark:text-white">Equipo editorial de CuponLab</strong>
            Página revisada el {todayWords}. Los cupones caducados se retiran solos y los encontrados en la web los comprueba una persona antes de publicarlos.
          </p>
        </section>
      </div>
    </main>
  );
}
