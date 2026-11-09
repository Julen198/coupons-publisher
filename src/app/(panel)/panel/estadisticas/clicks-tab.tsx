import Link from "next/link";
import { Combobox } from "@/app/combobox";
import { clickStats, type ClickRow } from "@/lib/clicks";
import { onlyVisible, visibleClientIds, type User } from "@/lib/auth";
import { listClients } from "@/lib/db";
import { SOURCE_LABEL } from "@/lib/click-signals";
import { btnSecondaryCls, cardCls, ClearFilters } from "@/app/ui";
import { DailyChart } from "./daily-chart";

const RANGES = [7, 30] as const;

// Magnitude per row: one hue, bar length relative to the top row, value in text ink
function BreakdownTable({ title, rows, hrefFor }: { title: string; rows: ClickRow[]; hrefFor?: (r: ClickRow) => string }) {
  const top = Math.max(1, ...rows.map((r) => r.clicks));
  return (
    <section aria-labelledby={`bd-${title}`} className="min-w-0 flex-[1_1_320px] overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
      <h2 id={`bd-${title}`} className="border-b border-neutral-200 px-5 py-3 font-semibold dark:border-neutral-800">{title}</h2>
      <table className="w-full text-sm">
        <thead className="sr-only"><tr><th>Nombre</th><th>Clics</th></tr></thead>
        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {rows.map((r) => (
            <tr key={r.id}>
              <th scope="row" className="w-2/5 px-5 py-2.5 text-left font-medium">{hrefFor ? <Link href={hrefFor(r)} className="hover:underline">{r.name}</Link> : r.name}</th>
              <td className="py-2.5 pr-5">
                <span className="flex items-center gap-3">
                  <span className="h-2 flex-1 rounded-full bg-neutral-100 dark:bg-neutral-800">
                    <span className="block h-2 rounded-full bg-blue-700 dark:bg-blue-400" style={{ width: `${(r.clicks / top) * 100}%` }} />
                  </span>
                  <span className="w-12 text-right tabular-nums">{r.clicks.toLocaleString("es-ES")}</span>
                </span>
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td className="px-5 py-6 text-neutral-500">Sin clics en este periodo.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}

// The «Clics por medio» tab of Estadísticas: our own clicks, per client (medio), store, coupon and origin. Scoped to the
// clients the user can see, so a viewer of one medio only gets its numbers.
export async function ClicksTab({ user, sp }: { user: User; sp: Record<string, string | string[] | undefined> }) {
  const allClients = await listClients();
  const clients = onlyVisible(user, allClients, "id");
  const days = RANGES.find((r) => String(r) === sp.days) ?? 30;
  const client = clients.find((c) => c.slug === sp.client);
  const stats = await clickStats(days, client?.id, visibleClientIds(user));

  const change = stats.previous ? Math.round(((stats.total - stats.previous) / stats.previous) * 100) : null;
  const filters = { tab: "clics", ...(client && { client: client.slug }) };
  // origins with a label of their own ("Ficha de chollo"); a campaign's own word (?o=seo, utm_source=newsletter) as written
  const bySource: ClickRow[] = stats.bySource.map((r, i) => ({ id: i, slug: r.source, name: SOURCE_LABEL[r.source] ?? r.source, clicks: r.clicks }));

  const kpis = [
    { label: `Clics (${days} días)`, value: stats.total.toLocaleString("es-ES"), note: client ? client.name : "Todos los medios" },
    {
      label: "Frente al periodo anterior",
      value: change === null ? "—" : `${change > 0 ? "▲ +" : change < 0 ? "▼ " : ""}${change}%`,
      note: `${stats.previous.toLocaleString("es-ES")} clics los ${days} días anteriores`,
    },
    {
      label: "Ir a la tienda frente a copiar código",
      value: `${stats.byKind.go.toLocaleString("es-ES")} / ${stats.byKind.copy.toLocaleString("es-ES")}`,
      note: stats.byKind.untracked
        ? `${stats.byKind.untracked.toLocaleString("es-ES")} fueron a la tienda sin tracking`
        : "con tracking / códigos copiados",
    },
    { label: "Media diaria", value: Math.round(stats.total / days).toLocaleString("es-ES"), note: "clics al día" },
    { label: "Tienda con más clics", value: stats.byStore[0]?.name ?? "—", note: stats.byStore[0] ? `${stats.byStore[0].clicks.toLocaleString("es-ES")} clics` : "" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <nav aria-label="Periodo" className="flex gap-1">
          {RANGES.map((r) => (
            <Link
              key={r}
              href={{ query: { ...filters, days: r } }}
              aria-current={days === r ? "true" : undefined}
              className={`flex min-h-10 items-center rounded-md px-3 text-sm ${days === r ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "border border-neutral-300 dark:border-neutral-700"}`}
            >
              Últimos {r} días
            </Link>
          ))}
        </nav>
        <form className="flex items-end gap-2">
          <input type="hidden" name="tab" value="clics" />
          <input type="hidden" name="days" value={days} />
          <div className="flex w-60 flex-col gap-1 text-xs text-neutral-500">
            <span aria-hidden="true">Medio</span>
            <Combobox
              name="client"
              label="Medio"
              defaultValue={client?.slug ?? ""}
              placeholder="Todos los medios"
              allLabel="Todos los medios"
              searchPlaceholder="Buscar medio…"
              emptyText="Ningún medio con ese nombre."
              options={clients.map((c) => ({ value: c.slug, label: c.name }))}
              submitOnClear
            />
          </div>
          <button className="min-h-10 rounded-md border border-neutral-300 px-3 text-sm dark:border-neutral-700">Filtrar</button>
          {(client || days !== 30) && <ClearFilters href="/panel/estadisticas?tab=clics" />}
        </form>
        {user.role === "admin" && <a href="/api/export/clicks" download className={`${btnSecondaryCls} ml-auto`}>Exportar CSV</a>}
      </div>

      <section aria-label="Indicadores" className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        {kpis.map((k) => (
          <div key={k.label} className={`${cardCls} flex flex-col gap-1`}>
            <span className="text-sm text-neutral-600 dark:text-neutral-400">{k.label}</span>
            <span className="truncate text-3xl font-bold tabular-nums">{k.value}</span>
            <span className="text-xs text-neutral-500">{k.note}</span>
          </div>
        ))}
      </section>

      <section aria-labelledby="daily" className={cardCls}>
        <h2 id="daily" className="mb-6 font-semibold">Clics por día</h2>
        <DailyChart data={stats.byDay} />
      </section>

      <div className="flex flex-wrap items-start gap-6">
        {!client && <BreakdownTable title="Por medio" rows={stats.byClient} hrefFor={(r) => `/panel/estadisticas?tab=clics&days=${days}&client=${r.slug}`} />}
        <BreakdownTable title="Por tienda" rows={stats.byStore} hrefFor={(r) => `/panel/stores/${r.slug}`} />
        <BreakdownTable title="Por origen" rows={bySource} />
      </div>

      <section aria-labelledby="top" className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
        <h2 id="top" className="border-b border-neutral-200 px-5 py-3 font-semibold dark:border-neutral-800">Cupones con más clics</h2>
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs text-neutral-500 dark:bg-neutral-900">
            <tr><th className="px-5 py-2.5 font-semibold">Cupón</th><th className="px-2 py-2.5 font-semibold">Tienda</th><th className="px-5 py-2.5 text-right font-semibold">Clics</th></tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {stats.topCoupons.map((c) => (
              <tr key={c.id}>
                <td className="px-5 py-2.5">
                  <Link href={`/panel/coupons?edit=${c.id}`} className="font-medium hover:underline">{c.title}</Link>
                  {c.code && <code className="ml-2 rounded border border-dashed border-neutral-400 px-1.5 font-mono text-xs">{c.code}</code>}
                </td>
                <td className="px-2 py-2.5 text-neutral-600 dark:text-neutral-400">{c.store_name}</td>
                <td className="px-5 py-2.5 text-right tabular-nums">{c.clicks.toLocaleString("es-ES")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="text-xs text-neutral-500">
        Cada clic se registra al pasar por <code className="font-mono">/go/…</code> antes de ir a la red. No cuenta bots ni vistas previas de enlaces,
        y el mismo navegador en el mismo cupón cuenta una vez cada 30 segundos. «Copiar código» se cuenta aparte y no suma en el total.
        Si un enlace deja de llevar tracking, el lector va igualmente a la tienda y el clic sale como sin tracking.
        El origen es la página o campaña donde se hizo el clic (portada, página de tienda, ficha, página del medio, widget,
        o el <code className="font-mono">utm_source</code> / <code className="font-mono">?o=</code> del enlace) y va también al final del clickref de la red.
      </p>
    </div>
  );
}
