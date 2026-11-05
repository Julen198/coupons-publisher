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
    <main className="mx-auto max-w-4xl px-4 pb-12">
      <JsonLd data={crumbsLd(base, crumbs)} />
      <JsonLd data={faqLd(faqs)} />
      <div className="pt-5"><Crumbs items={crumbs} /></div>
      <section className="grid gap-3 py-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">Calendario de ofertas y rebajas en España</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">Actualizado el {todayWords}</p>
        {next && (
          <p className="max-w-3xl text-[17px] leading-relaxed text-slate-700 dark:text-slate-300">
            La próxima fecha de ofertas es <strong className="text-slate-900 dark:text-white">{next.name}</strong>, el {longDate(next.date)}
            {daysBetween(today, next.date) > 0 ? <> (dentro de {daysBetween(today, next.date)} días)</> : <> (hoy)</>}. El Black Friday {bfYear} cae el {longDate(bf)}.
          </p>
        )}
      </section>

      <div className="grid gap-8">
        {[...byMonth.entries()].map(([ym, list]) => (
          <section key={ym} className="grid gap-3">
            <h2 className="text-xl font-bold">{MONTHS[Number(ym.slice(5)) - 1]} {ym.slice(0, 4)}</h2>
            <ul className="grid gap-2">
              {list.map((e) => {
                const left = daysBetween(today, e.date);
                return (
                  <li key={e.date + e.name} className="grid grid-cols-[56px_minmax(0,1fr)] items-center gap-4 rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                    <span className={`rounded border py-1 text-center leading-tight tabular-nums ${left <= 30 ? "border-orange-600 text-orange-700 dark:text-orange-400" : "border-slate-300 dark:border-slate-700"}`}>
                      <b className="block text-xl">{Number(e.date.slice(8))}</b>
                      <small className="text-[10px] uppercase tracking-wide">{WEEKDAYS[new Date(`${e.date}T12:00:00Z`).getUTCDay()].slice(0, 3)}</small>
                    </span>
                    <span className="min-w-0">
                      <strong>{e.name}</strong>
                      <span className="block text-sm text-slate-600 dark:text-slate-400">{e.note}</span>
                      <span className="block text-xs text-slate-500 dark:text-slate-500">
                        {WEEKDAYS[new Date(`${e.date}T12:00:00Z`).getUTCDay()]} {longDate(e.date)}{left > 0 ? ` · dentro de ${left} días` : " · hoy"}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <section className="grid gap-3 pt-10">
        <h2 className="text-xl font-bold">Preguntas sobre las fechas de ofertas</h2>
        <Faqs items={faqs} />
      </section>
      <p className="pt-8 text-sm">
        <Link href="/" className="font-semibold text-blue-700 hover:underline dark:text-blue-400">Ver los chollos de hoy</Link>
      </p>
    </main>
  );
}
