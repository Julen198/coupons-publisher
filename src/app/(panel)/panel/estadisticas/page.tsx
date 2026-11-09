import Link from "next/link";
import { io } from "next/cache";
import { cardCls, PageHeader } from "@/app/ui";
import { canEdit, requireUser } from "@/lib/auth";
import { SOURCE_LABEL } from "@/lib/click-signals";
import { loadStats, rangeOf, STATS_RANGES, type SourceState, type Stats, type Totals } from "@/lib/stats";
import { ClicksTab } from "./clicks-tab";

const n = (v: number) => Math.round(v).toLocaleString("es-ES");
const pct = (v: number) => `${(v * 100).toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`;
const pos = (v: number | null) => (v == null ? "—" : v.toLocaleString("es-ES", { maximumFractionDigits: 1 }));
const fmtDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });

// ▲/▼ against the previous period; for position, lower is better
function Delta({ cur, prev, lowerIsBetter = false }: { cur: number | null; prev: number | null; lowerIsBetter?: boolean }) {
  if (cur == null || prev == null || prev === 0) return <span className="text-neutral-500">sin periodo anterior</span>;
  const better = lowerIsBetter ? cur < prev : cur > prev;
  const txt = lowerIsBetter ? `${(prev - cur).toLocaleString("es-ES", { maximumFractionDigits: 1 })} puestos` : `${Math.abs(Math.round(((cur - prev) / prev) * 100))} %`;
  return <span className={`font-semibold ${better ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>{better ? "▲" : "▼"} {txt}</span>;
}

function Kpi({ label, value, cur, prev, src, lowerIsBetter }: { label: string; value: string; cur: number | null; prev: number | null; src: string; lowerIsBetter?: boolean }) {
  return (
    <div className={`${cardCls} flex flex-col gap-1.5 !p-4`}>
      <span className="text-sm text-neutral-500">{label}</span>
      <span className="text-2xl font-bold tabular-nums">{value}</span>
      <span className="flex flex-wrap gap-x-1 text-xs"><Delta cur={cur} prev={prev} lowerIsBetter={lowerIsBetter} /><span className="text-neutral-500">{src}</span></span>
    </div>
  );
}

function SourcePill({ label, s }: { label: string; s: SourceState }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium ${s.ok ? "border-neutral-200 dark:border-neutral-800" : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"}`}>
      <span aria-hidden="true" className={`size-2 rounded-full ${s.ok ? "bg-green-600" : "bg-amber-500"}`} />
      {label}<span className="font-normal text-neutral-500">· {s.note}</span>
    </span>
  );
}

function Funnel({ cur }: { cur: Totals }) {
  const steps: { label: string; value: number | null; note: string; orange?: boolean }[] = [
    { label: "Te ven en Google", value: cur.impressions || null, note: cur.impressions ? `${pct(cur.gClicks / cur.impressions)} entra (CTR)` : "Sin datos de Search Console" },
    { label: "Entran desde Google", value: cur.impressions ? cur.gClicks : null, note: cur.visits ? `${pct(cur.gClicks / cur.visits)} de las visitas viene de Google` : "" },
    { label: "Visitas totales", value: cur.visits, note: "Google, Telegram, directo…" },
    { label: "Van a la tienda", value: cur.clicks, note: cur.visits ? `${pct(cur.clicks / cur.visits)} de las visitas` : "", orange: true },
    { label: "Compran (Awin)", value: null, note: "Pendiente de la API de informes de Awin" },
  ];
  return (
    <ol className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
      {steps.map((s, i) => (
        <li key={s.label} className={`flex flex-col gap-1 rounded-lg border p-4 ${s.value == null ? "border-dashed border-neutral-300 dark:border-neutral-700" : "border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900"}`}>
          <span className="text-xs font-medium text-neutral-500">Paso {i + 1}</span>
          <span className="text-sm">{s.label}</span>
          <span className="text-2xl font-bold tabular-nums">{s.value == null ? "—" : n(s.value)}</span>
          <span className={`h-1.5 rounded-full ${s.value == null ? "bg-transparent" : s.orange ? "bg-orange-700 dark:bg-orange-400" : "bg-blue-700 dark:bg-blue-400"}`} />
          <span className="text-xs text-neutral-500">{s.note}</span>
        </li>
      ))}
    </ol>
  );
}

function DailyChart({ daily }: { daily: Stats["daily"] }) {
  const top = Math.max(10, ...daily.flatMap((d) => [d.visits, d.clicks]));
  const step = Math.max(1, Math.ceil(daily.length / 6));
  return (
    <div>
      <div className="flex h-56 items-end gap-0.5 border-b border-neutral-300 dark:border-neutral-700" role="img" aria-label="Visitas y clics a tiendas por día">
        {daily.map((d) => (
          <div key={d.day} title={`${fmtDay(d.day)}: ${n(d.visits)} visitas, ${n(d.clicks)} clics a tiendas`} className="flex h-full flex-1 items-end gap-px">
            <span className="block flex-1 rounded-t-sm bg-blue-300 dark:bg-blue-800" style={{ height: `${(d.visits / top) * 100}%` }} />
            <span className="block flex-1 rounded-t-sm bg-orange-700 dark:bg-orange-400" style={{ height: `${(d.clicks / top) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-neutral-500">
        {daily.filter((_, i) => i % step === 0).map((d) => <span key={d.day}>{fmtDay(d.day)}</span>)}
      </div>
    </div>
  );
}

const GUIDE: Record<string, [string, string]> = {
  published: ["Publicada", "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200"],
  scheduled: ["Programada", "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200"],
  rejected: ["Cancelada", "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"],
  none: ["Sin guía", "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"],
};

const th = "px-3 py-2 font-semibold";
const td = "px-3 py-2 text-right tabular-nums";

// Two tabs: General (Google + our clicks + guides + AI cost, the team's view) and Clics por medio (scoped to the clients
// the user can see). A viewer only gets the second.
function Tabs({ tab, general }: { tab: "general" | "clics"; general: boolean }) {
  const tabs = [{ id: "general", label: "General", href: "/panel/estadisticas", show: general }, { id: "clics", label: "Clics por medio", href: "/panel/estadisticas?tab=clics", show: true }];
  return (
    <nav aria-label="Secciones de estadísticas" className="flex gap-1 border-b border-neutral-200 dark:border-neutral-800">
      {tabs.filter((t) => t.show).map((t) => (
        <Link key={t.id} href={t.href} aria-current={tab === t.id ? "page" : undefined}
          className={`-mb-px flex min-h-11 items-center border-b-2 px-4 text-sm font-medium ${tab === t.id ? "border-blue-700 text-blue-800 dark:border-blue-400 dark:text-blue-300" : "border-transparent text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"}`}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export default async function StatsPage({ searchParams }: PageProps<"/panel/estadisticas">) {
  const user = await requireUser();
  await io();
  const sp = await searchParams;
  const general = canEdit(user);
  if (!general || sp.tab === "clics") {
    return (
      <div className="space-y-6">
        <PageHeader title="Estadísticas" eyebrow="Clics en los botones de cupón, por medio" />
        <Tabs tab="clics" general={general} />
        <ClicksTab user={user} sp={sp} />
      </div>
    );
  }
  const days = rangeOf(sp.dias);
  const s = await loadStats(days);
  const topOrigin = Math.max(1, ...s.origins.map((o) => o.clicks));

  return (
    <div className="space-y-6">
      <PageHeader title="Estadísticas" eyebrow="Google, la web y los clics a tiendas en un solo sitio">
        <nav aria-label="Periodo" className="flex gap-1 rounded-lg bg-neutral-100 p-1 dark:bg-neutral-900">
          {STATS_RANGES.map((d) => (
            <Link key={d} href={`/panel/estadisticas?dias=${d}`} aria-current={d === days ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${d === days ? "bg-white shadow-sm dark:bg-neutral-800" : "text-neutral-500"}`}>{d} días</Link>
          ))}
        </nav>
      </PageHeader>
      <Tabs tab="general" general />
      <p className="text-sm text-neutral-500">Del {fmtDay(s.range.start)} al {fmtDay(s.range.end)}, comparado con los {days} días anteriores.</p>

      <div className="flex flex-wrap gap-2">
        <SourcePill label="Search Console" s={s.sources.search} />
        <SourcePill label="Google Analytics 4" s={s.sources.ga4} />
        <SourcePill label="Clics propios" s={{ ok: true, note: "en directo" }} />
        <SourcePill label="Informes de Awin" s={{ ok: false, note: "pendiente" }} />
      </div>

      <section aria-label="Indicadores" className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        <Kpi label="Impresiones en Google" value={s.sources.search.ok ? n(s.cur.impressions) : "—"} cur={s.cur.impressions} prev={s.prev.impressions} src="Search Console" />
        <Kpi label="Clics desde Google" value={s.sources.search.ok ? n(s.cur.gClicks) : "—"} cur={s.cur.gClicks} prev={s.prev.gClicks} src="Search Console" />
        <Kpi label="Posición media" value={pos(s.cur.position)} cur={s.cur.position} prev={s.prev.position} src="Search Console" lowerIsBetter />
        <Kpi label="Visitas a la web" value={s.cur.visits == null ? "—" : n(s.cur.visits)} cur={s.cur.visits} prev={s.prev.visits} src="GA4" />
        <Kpi label="Clics a tiendas" value={n(s.cur.clicks)} cur={s.cur.clicks} prev={s.prev.clicks} src="/go/…" />
        <Kpi label="Códigos copiados" value={n(s.cur.copies)} cur={s.cur.copies} prev={s.prev.copies} src="Copiar código" />
      </section>

      <section className={`${cardCls} space-y-4`} aria-labelledby="funnel">
        <h2 id="funnel" className="font-semibold">Del buscador a la tienda</h2>
        <Funnel cur={s.cur} />
      </section>

      <section className={`${cardCls} space-y-4`} aria-labelledby="daily">
        <div className="flex flex-wrap items-center gap-4">
          <h2 id="daily" className="font-semibold">Visitas y clics a tiendas por día</h2>
          <span className="flex items-center gap-1.5 text-sm"><span aria-hidden="true" className="size-2.5 rounded-sm bg-blue-300 dark:bg-blue-800" />Visitas (GA4)</span>
          <span className="flex items-center gap-1.5 text-sm"><span aria-hidden="true" className="size-2.5 rounded-sm bg-orange-700 dark:bg-orange-400" />Clics a tiendas</span>
        </div>
        <DailyChart daily={s.daily} />
      </section>

      <div className="flex flex-wrap items-start gap-6">
        <section aria-labelledby="origin" className="min-w-0 flex-[1_1_320px] overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
          <div className="border-b border-neutral-200 px-5 py-3 dark:border-neutral-800">
            <h2 id="origin" className="font-semibold">Clics a tiendas por origen</h2>
            <p className="text-xs text-neutral-500">El mismo origen va al final del clickref en las redes</p>
          </div>
          {s.origins.length === 0 && <p className="px-5 py-6 text-sm text-neutral-500">Sin clics en este periodo.</p>}
          {s.origins.map((o) => (
            <div key={o.source} className="grid grid-cols-[150px_1fr_56px] items-center gap-3 border-t border-neutral-100 px-5 py-2.5 text-sm first:border-t-0 dark:border-neutral-800">
              <span className="font-medium">{SOURCE_LABEL[o.source] ?? o.source}</span>
              <span className="h-2 rounded-full bg-neutral-100 dark:bg-neutral-800"><span className="block h-2 rounded-full bg-orange-700 dark:bg-orange-400" style={{ width: `${(o.clicks / topOrigin) * 100}%` }} /></span>
              <span className="text-right tabular-nums">{n(o.clicks)}</span>
            </div>
          ))}
        </section>

        <section aria-labelledby="queries" className="min-w-0 flex-[2_1_460px] overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-neutral-200 px-5 py-3 dark:border-neutral-800">
            <h2 id="queries" className="font-semibold">Búsquedas en Google</h2>
            <span className="text-xs text-neutral-500">«Cerca»: posición 8–30, donde una guía puede subirla</span>
          </div>
          {s.queries.length === 0 ? (
            <p className="px-5 py-6 text-sm text-neutral-500">{s.sources.search.ok ? "Google todavía no muestra la web en búsquedas de este periodo." : "Sin datos de Search Console."}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="bg-neutral-50 text-left text-xs text-neutral-500 dark:bg-neutral-900">
                  <tr><th className={`${th} pl-5`}>Búsqueda</th><th className={`${th} text-right`}>Impresiones</th><th className={`${th} text-right`}>Clics</th><th className={`${th} text-right`}>CTR</th><th className={`${th} pr-5 text-right`}>Posición</th></tr>
                </thead>
                <tbody>
                  {s.queries.map((q) => (
                    <tr key={q.query} className="border-t border-neutral-100 dark:border-neutral-800">
                      <td className="px-3 py-2 pl-5 font-medium">{q.query}{q.position >= 8 && q.position <= 30 && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">Cerca</span>}</td>
                      <td className={td}>{n(q.impressions)}</td><td className={td}>{n(q.clicks)}</td>
                      <td className={`${td} text-neutral-500`}>{q.impressions ? pct(q.clicks / q.impressions) : "—"}</td>
                      <td className={`${td} pr-5 font-semibold`}>{pos(q.position)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section aria-labelledby="stores" className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-neutral-200 px-5 py-3 dark:border-neutral-800">
          <h2 id="stores" className="font-semibold">Páginas de tienda</h2>
          <span className="text-xs text-neutral-500">Google, visitas y clics de cada /tiendas/…, con el estado de su guía</span>
        </div>
        {s.stores.length === 0 ? <p className="px-5 py-6 text-sm text-neutral-500">Sin actividad en las páginas de tienda en este periodo.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-neutral-50 text-left text-xs text-neutral-500 dark:bg-neutral-900">
                <tr><th className={`${th} pl-5`}>Tienda</th><th className={th}>Guía SEO</th><th className={`${th} text-right`}>Impresiones</th><th className={`${th} text-right`}>Posición</th><th className={`${th} text-right`}>Visitas</th><th className={`${th} text-right`}>Clics a tienda</th><th className={`${th} pr-5 text-right`}>% de visitas</th></tr>
              </thead>
              <tbody>
                {s.stores.map((r) => (
                  <tr key={r.slug} className="border-t border-neutral-100 dark:border-neutral-800">
                    <td className="px-3 py-2 pl-5 font-medium"><Link href={`/tiendas/${r.slug}`} className="hover:underline">{r.name}</Link></td>
                    <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${GUIDE[r.guide][1]}`}>{GUIDE[r.guide][0]}</span></td>
                    <td className={td}>{n(r.impressions)}</td><td className={td}>{pos(r.position)}</td><td className={td}>{n(r.visits)}</td><td className={td}>{n(r.clicks)}</td>
                    <td className={`${td} pr-5 text-neutral-500`}>{r.visits ? pct(r.clicks / r.visits) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-6">
        <section className={`${cardCls} space-y-3`} aria-labelledby="guides">
          <div className="flex items-baseline justify-between"><h2 id="guides" className="font-semibold">Guías SEO automáticas</h2><Link href="/panel/guias" className="text-sm text-blue-700 hover:underline dark:text-blue-400">Ver guías</Link></div>
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-2xl font-bold">{s.guides.published}</p><p className="text-sm text-neutral-500">Publicadas</p></div>
            <div><p className="text-2xl font-bold">{s.guides.scheduled}</p><p className="text-sm text-neutral-500">Programadas</p></div>
          </div>
          {s.guides.next && <p className="text-sm">Próxima: {s.guides.next.name}, el {s.guides.next.at.toLocaleString("es-ES", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" })}.</p>}
        </section>
        <section className={`${cardCls} space-y-3`} aria-labelledby="money">
          <h2 id="money" className="font-semibold">Ingresos y costes</h2>
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-2xl font-bold text-neutral-400">—</p><p className="text-sm text-neutral-500">Comisiones (Awin)</p></div>
            <div><p className="text-2xl font-bold tabular-nums">{s.aiCost.toLocaleString("es-ES", { style: "currency", currency: "USD" })}</p><p className="text-sm text-neutral-500">Coste de IA en el periodo</p></div>
          </div>
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">Las comisiones aparecerán al conectar la API de informes de Awin, cruzadas por el clickref <code>cuponlab-…</code>.</p>
        </section>
      </div>

      <p className="text-xs text-neutral-500">Search Console llega con 2–3 días de retraso. GA4 solo cuenta a quien acepta las cookies de analítica. Los clics a tiendas son los de /go/…, sin bots.</p>
    </div>
  );
}
