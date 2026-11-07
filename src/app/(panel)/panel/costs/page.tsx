import Link from "next/link";
import { saveAiLimits } from "@/app/actions-admin";
import { aiLimits, usageSince } from "@/lib/ai-budget";
import { AI_FEATURES, byFeature, dailyByFeature, FEATURE_INFO, madridDay, monthForecast, usd } from "@/lib/ai-costs";
import { requireAdmin } from "@/lib/auth";
import { sql } from "@/lib/db";
import { btnCls, cardCls, inputCls, PageHeader } from "@/app/ui";
import { CostChart, SERIES, Swatch } from "./cost-chart";

const RANGES = [
  { id: "7", label: "7 días" },
  { id: "30", label: "30 días" },
  { id: "mes", label: "Este mes" },
] as const;

const int = (n: number) => Math.round(n).toLocaleString("es-ES");
const kTokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toLocaleString("es-ES", { maximumFractionDigits: 1 })} M` : `${int(n / 1000)} k`);
const fmtWhen = (d: Date) => d.toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });

// Madrid calendar days from `from` to today, inclusive
function dayList(from: Date, now: Date) {
  const days: string[] = [];
  for (let d = new Date(from); madridDay(d) <= madridDay(now); d = new Date(d.getTime() + 86_400_000)) days.push(madridDay(d));
  return [...new Set(days)];
}

export default async function CostsPage({ searchParams }: PageProps<"/panel/costs">) {
  await requireAdmin();
  const sp = await searchParams;
  const range = RANGES.find((r) => r.id === sp.r)?.id ?? "30";
  const now = new Date();
  const monthStart = new Date(`${madridDay(now).slice(0, 8)}01T00:00:00`);
  const start = range === "mes" ? monthStart : new Date(now.getTime() - (Number(range) - 1) * 86_400_000);
  const startDay = madridDay(start);
  const span = now.getTime() - new Date(`${startDay}T00:00:00`).getTime();
  const prevStart = new Date(new Date(`${startDay}T00:00:00`).getTime() - span);

  const [all, limits, [found]] = await Promise.all([
    usageSince(64),
    aiLimits(),
    sql()<{ n: number }[]>`SELECT count(*)::int AS n FROM coupons WHERE source = 'web' AND created_at >= ${new Date(`${startDay}T00:00:00`)}`,
  ]);
  const rows = all.filter((r) => madridDay(r.at) >= startDay);
  const prev = all.filter((r) => r.at >= prevStart && madridDay(r.at) < startDay);
  const month = all.filter((r) => madridDay(r.at) >= madridDay(monthStart));
  const sum = (list: typeof all) => list.reduce((a, r) => a + r.cost_total, 0);

  const total = sum(rows);
  const previous = sum(prev);
  const spent = sum(month);
  const forecast = monthForecast(spent, now);
  const used = Math.min(100, Math.round((spent / limits.budget) * 100));
  const level = forecast >= limits.budget ? "bad" : used >= limits.alert ? "warn" : "ok";
  const feats = byFeature(rows);
  const calls = rows.length;
  const searches = AI_FEATURES.reduce((a, f) => a + feats[f].searches, 0);
  const gateway = rows.reduce((a, r) => a + r.cost_gateway, 0);
  const topFeature = Math.max(...AI_FEATURES.map((f) => feats[f].cost), 1e-9);
  const stores = [...rows.filter((r) => r.feature === "search").reduce((m, r) => m.set(r.about, { runs: (m.get(r.about)?.runs ?? 0) + 1, cost: (m.get(r.about)?.cost ?? 0) + r.cost_total }), new Map<string, { runs: number; cost: number }>())]
    .sort((a, b) => b[1].cost - a[1].cost)
    .slice(0, 5);
  const log = [...all].reverse().slice(0, 20);
  const estimatedCount = rows.filter((r) => r.estimated).length;
  const estimatedTotal = rows.filter((r) => r.estimated).reduce((a, r) => a + r.cost_total, 0);
  const change = previous ? `${total >= previous ? "▲" : "▼"} ${Math.abs(Math.round(((total - previous) / previous) * 100))}% frente al periodo anterior (${usd(previous)})` : "Sin datos del periodo anterior";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="IA a través de Vercel AI Gateway · importes en dólares, como se factura" title="Costes de IA">
        <nav aria-label="Periodo" className="flex gap-0.5 rounded-lg bg-neutral-100 p-0.5 dark:bg-neutral-800">
          {RANGES.map((r) => (
            <Link
              key={r.id}
              href={r.id === "30" ? "/panel/costs" : `/panel/costs?r=${r.id}`}
              aria-current={range === r.id ? "page" : undefined}
              className={`flex min-h-9 items-center rounded-md px-3 text-sm ${range === r.id ? "bg-white font-medium shadow-sm dark:bg-neutral-950" : "text-neutral-600 dark:text-neutral-400"}`}
            >
              {r.label}
            </Link>
          ))}
        </nav>
        <a href="/api/export/costes-ia" download className="flex min-h-10 items-center rounded-md border border-neutral-300 px-4 text-sm dark:border-neutral-700">Exportar CSV</a>
      </PageHeader>

      {level !== "ok" && (
        <p role="status" className={`rounded-lg px-4 py-3 text-sm ${level === "bad" ? "bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100" : "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100"}`}>
          {level === "bad"
            ? `A este ritmo el mes acabará en ${usd(forecast)}, por encima del presupuesto de ${usd(limits.budget)}.${limits.pauseSearch && spent >= limits.budget ? " La búsqueda de cupones está parada." : ""}`
            : `Llevas el ${used}% del presupuesto del mes (${usd(spent)} de ${usd(limits.budget)}).`}
        </p>
      )}

      <section aria-label="Indicadores" className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-4">
        <div className={`${cardCls} flex flex-col gap-1`}>
          <span className="text-sm text-neutral-600 dark:text-neutral-400">Gasto · {RANGES.find((r) => r.id === range)!.label.toLowerCase()}</span>
          <span className="text-3xl font-bold tabular-nums">{usd(total)}</span>
          <span className="text-sm text-neutral-600 dark:text-neutral-400">{change}</span>
        </div>
        <div className={`${cardCls} flex flex-col gap-2`}>
          <span className="text-sm text-neutral-600 dark:text-neutral-400">Este mes: presupuesto</span>
          <span className="text-3xl font-bold tabular-nums">{usd(spent)} <span className="text-base font-medium text-neutral-500">de {usd(limits.budget, 0)}</span></span>
          <span role="meter" aria-label="Presupuesto usado" aria-valuemin={0} aria-valuemax={100} aria-valuenow={used} className="block h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
            <span className={`block h-full rounded-full ${level === "bad" ? "bg-red-700" : level === "warn" ? "bg-amber-500" : "bg-green-700"}`} style={{ width: `${used}%` }} />
          </span>
          <span className={`text-sm ${level === "bad" ? "font-semibold text-red-800 dark:text-red-300" : "text-neutral-600 dark:text-neutral-400"}`}>Previsión a fin de mes: {usd(forecast)}</span>
        </div>
        <div className={`${cardCls} flex flex-col gap-1`}>
          <span className="text-sm text-neutral-600 dark:text-neutral-400">Llamadas a la IA</span>
          <span className="text-3xl font-bold tabular-nums">{int(calls)}</span>
          <span className="text-sm text-neutral-600 dark:text-neutral-400">{int(searches)} búsquedas web</span>
        </div>
        <div className={`${cardCls} flex flex-col gap-1`}>
          <span className="text-sm text-neutral-600 dark:text-neutral-400">Coste por cupón encontrado</span>
          <span className="text-3xl font-bold tabular-nums">{found.n && feats.search.cost ? usd(feats.search.cost / found.n, 3) : "—"}</span>
          <span className="text-sm text-neutral-600 dark:text-neutral-400">{int(found.n)} cupones encontrados en internet</span>
        </div>
      </section>

      <section aria-labelledby="chart-h" className={`${cardCls} flex flex-col gap-3`}>
        <h2 id="chart-h" className="font-semibold">Gasto por día</h2>
        <CostChart data={dailyByFeature(rows, dayList(start, now))} />
      </section>

      <div className="flex flex-wrap items-start gap-6">
        <section aria-labelledby="what-h" className="min-w-0 flex-[999_1_600px] overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
          <div className="border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
            <h2 id="what-h" className="font-semibold">En qué se gasta</h2>
            <p className="text-sm text-neutral-500">Cada función del panel que llama a la IA, en el periodo elegido.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-neutral-50 text-left text-xs text-neutral-500 dark:bg-neutral-900">
                <tr>
                  <th className="px-5 py-2.5 font-semibold">Función</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Llamadas</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Tokens (entrada / salida)</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Búsquedas web</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Coste</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {AI_FEATURES.map((f) => (
                  <tr key={f}>
                    <th scope="row" className="px-5 py-3 text-left font-medium">
                      <span className="flex items-start gap-2.5"><span className="mt-1.5"><Swatch feature={f} /></span><span className="flex flex-col">{FEATURE_INFO[f].label}<span className="text-xs font-normal text-neutral-500">{FEATURE_INFO[f].what}</span></span></span>
                    </th>
                    <td className="px-2 py-3 text-right tabular-nums">{int(feats[f].calls)}</td>
                    <td className="px-2 py-3 text-right tabular-nums text-neutral-600 dark:text-neutral-400">{kTokens(feats[f].input)} / {kTokens(feats[f].output)}</td>
                    <td className="px-2 py-3 text-right tabular-nums text-neutral-600 dark:text-neutral-400">{feats[f].searches ? int(feats[f].searches) : "—"}</td>
                    <td className="px-5 py-3">
                      <span className="flex flex-col items-end gap-1.5">
                        <span className="tabular-nums font-semibold">{usd(feats[f].cost)} <span className="font-normal text-neutral-500">· {total ? Math.round((feats[f].cost / total) * 100) : 0}%</span></span>
                        <span className="block h-1.5 w-28 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800"><span className={`block h-full ${SERIES[f]}`} style={{ width: `${(feats[f].cost / topFeature) * 100}%` }} /></span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-neutral-300 font-semibold dark:border-neutral-700">
                <tr>
                  <th scope="row" className="px-5 py-3 text-left">Total</th>
                  <td className="px-2 py-3 text-right tabular-nums">{int(calls)}</td>
                  <td className="px-2 py-3 text-right tabular-nums">{kTokens(rows.reduce((a, r) => a + r.input_tokens, 0))} / {kTokens(rows.reduce((a, r) => a + r.output_tokens, 0))}</td>
                  <td className="px-2 py-3 text-right tabular-nums">{int(searches)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{usd(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-6">
          <section aria-labelledby="prov-h" className={`${cardCls} flex flex-col gap-4`}>
            <h2 id="prov-h" className="font-semibold">Por proveedor</h2>
            {[
              { label: "Anthropic · tokens de Claude", note: "Con tu clave de Anthropic: lo factura Anthropic", v: total - gateway },
              { label: "Vercel AI Gateway · búsquedas web", note: `${int(searches)} búsquedas: lo factura Vercel`, v: gateway },
            ].map((p) => (
              <div key={p.label} className="flex flex-col gap-1.5">
                <span className="flex justify-between gap-2 text-sm"><span>{p.label}</span><span className="tabular-nums font-semibold">{usd(p.v)}</span></span>
                <span className="block h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800"><span className="block h-full bg-blue-700 dark:bg-blue-400" style={{ width: `${total ? (p.v / total) * 100 : 0}%` }} /></span>
                <span className="text-xs text-neutral-500">{p.note}</span>
              </div>
            ))}
          </section>

          <form action={saveAiLimits} className={`${cardCls} flex flex-col gap-3`}>
            <h2 className="font-semibold">Límites</h2>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-neutral-600 dark:text-neutral-400">Presupuesto mensual (US$)</span>
              <input name="budget" type="number" min="1" step="1" required defaultValue={limits.budget} className={`${inputCls} tabular-nums`} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-neutral-600 dark:text-neutral-400">Avisar al llegar al</span>
              <select name="alert" defaultValue={String(limits.alert)} className={inputCls}>
                {[50, 80, 100].map((v) => <option key={v} value={v}>{v}% del presupuesto</option>)}
              </select>
            </label>
            <label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" name="pause_search" defaultChecked={limits.pauseSearch} className="mt-0.5 size-4" />
              <span className="flex flex-col">Parar la búsqueda de cupones si se supera<span className="text-xs text-neutral-500">El resto de funciones siguen; la búsqueda masiva es lo que más gasta.</span></span>
            </label>
            <button className={`${btnCls} min-h-10 self-start`}>Guardar límites</button>
          </form>
        </aside>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <section aria-labelledby="stores-h" className="min-w-0 flex-[1_1_320px] overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
          <h2 id="stores-h" className="border-b border-neutral-200 px-5 py-4 font-semibold dark:border-neutral-800">Búsqueda de cupones: tiendas que más cuestan</h2>
          <ul className="divide-y divide-neutral-100 text-sm dark:divide-neutral-800">
            {stores.map(([name, s]) => (
              <li key={name} className="flex items-center gap-3 px-5 py-3">
                <span className="flex flex-1 flex-col">{name}<span className="text-xs text-neutral-500">{s.runs} búsqueda{s.runs === 1 ? "" : "s"}</span></span>
                <span className="tabular-nums font-semibold">{usd(s.cost, 3)}</span>
              </li>
            ))}
            {stores.length === 0 && <li className="px-5 py-6 text-neutral-500">Sin búsquedas en este periodo.</li>}
          </ul>
        </section>

        <section aria-labelledby="log-h" className="min-w-0 flex-[999_1_560px] overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
          <h2 id="log-h" className="border-b border-neutral-200 px-5 py-4 font-semibold dark:border-neutral-800">Últimas llamadas</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead className="bg-neutral-50 text-left text-xs text-neutral-500 dark:bg-neutral-900">
                <tr>
                  <th className="px-5 py-2.5 font-semibold">Cuándo</th>
                  <th className="px-2 py-2.5 font-semibold">Función</th>
                  <th className="px-2 py-2.5 font-semibold">Sobre</th>
                  <th className="px-2 py-2.5 font-semibold">Quién</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Coste</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {log.map((l, i) => (
                  <tr key={`${l.at.toISOString()}-${i}`}>
                    <td className="px-5 py-2.5 whitespace-nowrap text-neutral-500">{fmtWhen(l.at)}</td>
                    <td className="px-2 py-2.5"><span className="flex items-center gap-2"><Swatch feature={l.feature} />{FEATURE_INFO[l.feature].label}</span></td>
                    <td className="px-2 py-2.5">{l.about}</td>
                    <td className="px-2 py-2.5 text-xs text-neutral-500">{l.user_name || "—"}</td>
                    <td className="px-5 py-2.5 text-right">
                      {l.estimated && <span title="Llamada de antes de activar el registro: coste estimado con la media medida" className="mr-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">estimado</span>}
                      {l.ok ? <span className="tabular-nums">{usd(l.cost_total, 3)}</span> : <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-900 dark:bg-red-900 dark:text-red-100">Error</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {log.length === 0 && <p className="p-8 text-center text-sm text-neutral-500">Aún no hay llamadas registradas. Se apuntan desde ahora: estilo de la demo, listas de tiendas, contenido y búsqueda de cupones.</p>}
          </div>
        </section>
      </div>

      <p className="text-xs text-neutral-500">
        Importes a precio de lista de cada llamada, según el AI Gateway. Las llamadas que fallan se apuntan a 0.
        {estimatedCount > 0 && ` Incluye ${int(estimatedCount)} llamadas de antes de activar el registro, estimadas con el coste medio medido (${usd(estimatedTotal)}).`}
      </p>
    </div>
  );
}

