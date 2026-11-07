import type { Metadata } from "next";
import { connection } from "next/server";
import { blackFriday, calendarGroups, daysBetween, eventsOf, longDate, madridToday, monthShort, siteUrl, untilLabel } from "@/lib/site-text";
import { Crumbs, Faqs, JsonLd, crumbsLd, faqLd } from "../site-ui";

export const metadata: Metadata = {
  title: "Calendario de ofertas y rebajas en España",
  description: "Las fechas de rebajas, Black Friday, Cyber Monday, Día del Soltero y demás días de ofertas en España para los próximos 12 meses.",
  alternates: { canonical: "/calendario" },
};

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const weekday = (iso: string) => WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()];
// "11 de noviembre", the year left out as the h1 already gives it
const dayMonth = (iso: string) => longDate(iso).replace(/ de \d{4}$/, "");

// The next 12 months of shopping dates, month by month
export default async function CalendarPage() {
  await connection(); // "today" is read per request, not frozen at build time
  const { iso: today } = madridToday(new Date());
  const year = Number(today.slice(0, 4));
  const end = `${year + 1}${today.slice(4)}`;
  const events = [...eventsOf(year), ...eventsOf(year + 1)].filter((e) => e.date >= today && e.date < end);
  const groups = calendarGroups(events, today);
  const next = events[0];
  const bfYear = today > blackFriday(year) ? year + 1 : year;
  const bf = blackFriday(bfYear);
  const daysToBf = daysBetween(today, bf);
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
        <section className="intro is-sub">
          <h1>Calendario de ofertas {year}</h1>
          <p className="answer" data-seo="Respuesta citable (GEO)">
            Las fechas en las que las tiendas españolas concentran sus descuentos.
            {next && next.date !== bf && (
              <>
                {" "}La próxima es <strong>{next.name}, {daysBetween(today, next.date) === 0 ? "hoy" : `el ${dayMonth(next.date)}`}</strong>,
              </>
            )}
            {daysToBf === 0 ? (
              <> {next?.date === bf ? "Hoy" : "y hoy"} es el <strong>Black Friday</strong>.</>
            ) : (
              <>
                {" "}{next?.date === bf ? "Quedan" : "y quedan"} <strong>{daysToBf === 1 ? "1 día" : `${daysToBf} días`} para el Black Friday</strong>, el {weekday(bf)} {bfYear === year ? dayMonth(bf) : longDate(bf)}.
              </>
            )}
          </p>
        </section>

        <div className="grid">
          <div>
            {groups.map(({ label, events: list }) => (
              <section key={label} aria-labelledby={`mes-${label}`}>
                <h2 id={`mes-${label}`} className="month">{label}</h2>
                <ul className="cal-list">
                  {list.map((e) => {
                    const left = daysBetween(today, e.date);
                    return (
                      <li key={e.date + e.name} className={e.date === bf ? "soon" : undefined}>
                        <span className="d">
                          <b>{Number(e.date.slice(8))}</b>
                          <small>{monthShort(Number(e.date.slice(5, 7)))}</small>
                        </span>
                        <span style={{ minWidth: 0 }}>
                          <strong>{e.name}</strong>
                          <span className="note">{e.note}</span>
                        </span>
                        <span className="when">
                          <time dateTime={e.date} title={`${weekday(e.date)} ${longDate(e.date)}`}>{untilLabel(left)}</time>
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
              <h2>Dudas sobre estas fechas</h2>
              <Faqs items={faqs} />
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
