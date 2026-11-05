import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { blackFriday, daysBetween, eventsOf, longDate, madridToday, siteUrl } from "@/lib/site-text";
import { Crumbs, Faqs, JsonLd, crumbsLd, faqLd } from "../site-ui";

export const metadata: Metadata = {
  title: "Calendario de ofertas y rebajas en España",
  description: "Las fechas de rebajas, Black Friday, Cyber Monday, Día del Soltero y demás días de ofertas en España para los próximos 12 meses.",
  alternates: { canonical: "/calendario" },
};

const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const weekday = (iso: string) => WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()];

// The next 12 months of shopping dates, month by month
export default async function CalendarPage() {
  await connection(); // "today" is read per request, not frozen at build time
  const { iso: today, words: todayWords } = madridToday(new Date());
  const year = Number(today.slice(0, 4));
  const end = `${year + 1}${today.slice(4)}`;
  const events = [...eventsOf(year), ...eventsOf(year + 1)].filter((e) => e.date >= today && e.date < end);
  const byMonth = new Map<string, typeof events>();
  for (const e of events) byMonth.set(e.date.slice(0, 7), [...(byMonth.get(e.date.slice(0, 7)) ?? []), e]);
  const next = events[0];
  const bfYear = today > blackFriday(year) ? year + 1 : year;
  const bf = blackFriday(bfYear);
  const faqs = [
    { q: `¿Cuándo es el Black Friday ${bfYear}?`, a: `El viernes ${longDate(bf)}. El Cyber Monday es el lunes siguiente y muchas tiendas empiezan las ofertas una semana antes.` },
    { q: "¿Cuándo empiezan las rebajas de enero?", a: "El 7 de enero, el día después de Reyes, en casi todas las tiendas de moda y hogar. Algunas las adelantan en su web o para clientes registrados." },
    { q: "¿Cuándo es el Día de la Madre en España?", a: "El primer domingo de mayo. Las ofertas de perfumería, belleza y moda suelen empezar una o dos semanas antes." },
  ];
  const base = siteUrl();
  const crumbs = [{ name: "Inicio", href: "/" }, { name: "Calendario de ofertas" }];

  return (
    <main>
      <JsonLd data={crumbsLd(base, crumbs)} />
      <JsonLd data={faqLd(faqs)} />
      <div className="wrap">
        <Crumbs items={crumbs} />
        <section className="intro">
          <h1>Calendario de ofertas y rebajas en España</h1>
          <div className="meta-line">
            <span className="live">Actualizado el {todayWords}</span>
          </div>
          {next && (
            <p className="answer">
              La próxima fecha de ofertas es <strong>{next.name}</strong>, el {weekday(next.date)} {longDate(next.date)}
              {daysBetween(today, next.date) > 0 ? <> (dentro de {daysBetween(today, next.date)} días)</> : <> (hoy)</>}. El <strong>Black Friday {bfYear}</strong> cae el {longDate(bf)}.
            </p>
          )}
        </section>

        <div className="grid">
          <div>
            {[...byMonth.entries()].map(([ym, list]) => (
              <section key={ym} className="page-sec">
                <h2>
                  {MONTHS[Number(ym.slice(5)) - 1]} {ym.slice(0, 4)}
                </h2>
                <ul className="cal-list">
                  {list.map((e) => {
                    const left = daysBetween(today, e.date);
                    return (
                      <li key={e.date + e.name} className={left <= 30 ? "soon" : undefined}>
                        <span className="d">
                          <b>{Number(e.date.slice(8))}</b>
                          <small>{weekday(e.date).slice(0, 3)}</small>
                        </span>
                        <span style={{ minWidth: 0 }}>
                          <strong>{e.name}</strong>
                          <span className="note">{e.note}</span>
                          <span className="when" style={{ display: "block" }}>
                            {weekday(e.date)} {longDate(e.date)}
                            {left > 0 ? ` · dentro de ${left} días` : " · hoy"}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
          <aside className="rail">
            <section className="panel">
              <h2>Preguntas sobre las fechas</h2>
              <Faqs items={faqs} />
            </section>
            <section className="panel">
              <h2>¿Buscas un descuento hoy?</h2>
              <p className="small">Mientras llega la próxima fecha, estos son los cupones que funcionan ahora.</p>
              <Link href="/">Ver los chollos de hoy</Link>
              <Link href="/tiendas">Ver todas las tiendas</Link>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
