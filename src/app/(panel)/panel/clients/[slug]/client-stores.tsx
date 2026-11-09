import Link from "next/link";
import { bulkStoreState, setStoreState } from "@/app/actions-pages";
import { bulkTargets, STATE_LABEL, type StoreAction, type StoreState } from "@/lib/store-states";

export interface ClientStoreRow { storeId: number; slug: string; name: string; state: StoreState; live: number }
export type StateFilter = "todas" | "activas" | "nuevas" | "inactivas" | "bloqueadas";

export const STATE_FILTERS: { id: StateFilter; label: string; state?: StoreState }[] = [
  { id: "todas", label: "Todas" },
  { id: "nuevas", label: "Nuevas", state: "new" },
  { id: "activas", label: "Activas", state: "active" },
  { id: "inactivas", label: "Inactivas", state: "inactive" },
  { id: "bloqueadas", label: "Bloqueadas", state: "blocked" },
];

const BADGE: Record<StoreState, string> = {
  active: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200",
  inactive: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  blocked: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  new: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
};

// The buttons each state offers: a blocked store only «Desbloquear» (activating it is a deliberate second step)
const ACTIONS: Record<StoreState, { action: StoreAction; label: string; primary?: boolean }[]> = {
  new: [{ action: "activate", label: "Activar", primary: true }, { action: "deactivate", label: "Dejar inactiva" }, { action: "block", label: "Bloquear" }],
  inactive: [{ action: "activate", label: "Activar", primary: true }, { action: "block", label: "Bloquear" }],
  active: [{ action: "deactivate", label: "Desactivar" }, { action: "block", label: "Bloquear" }],
  blocked: [{ action: "unblock", label: "Desbloquear" }],
};

const btn = "min-h-9 rounded-md px-3 text-sm font-medium";
const btnStyle = (primary?: boolean, danger?: boolean) =>
  primary ? `${btn} bg-blue-700 text-white hover:bg-blue-800 dark:bg-blue-600`
    : danger ? `${btn} border border-red-300 text-red-800 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950`
    : `${btn} border border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900`;

const ORDER: Record<StoreState, number> = { new: 0, active: 1, inactive: 2, blocked: 3 };

export function ClientStores({ client, rows, filter, onlyLive, q, editable }: {
  client: { slug: string; name: string }; rows: ClientStoreRow[]; filter: StateFilter; onlyLive: boolean; q: string; editable: boolean;
}) {
  const count = (s: StoreState) => rows.filter((r) => r.state === s).length;
  const toActivate = bulkTargets(rows, "activate").length;
  const toDeactivate = bulkTargets(rows, "deactivate").length;
  const wanted = STATE_FILTERS.find((f) => f.id === filter)?.state;
  const needle = q.trim().toLowerCase();
  const shown = rows
    .filter((r) => (!wanted || r.state === wanted) && (!onlyLive || r.live > 0 || r.state === "active") && (!needle || r.name.toLowerCase().includes(needle)))
    .sort((a, b) => ORDER[a.state] - ORDER[b.state] || b.live - a.live || a.name.localeCompare(b.name, "es"));
  const href = (over: Record<string, string>) => ({ query: { estado: filter, ...(onlyLive ? {} : { cupones: "todas" }), ...(q ? { q } : {}), ...over } });

  return (
    <section aria-labelledby="stores-h" className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
      <div className="flex flex-col gap-3 border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="stores-h" className="font-semibold">Tiendas · {count("active")} activas</h2>
            <p className="text-sm text-neutral-500">
              Las tiendas nuevas entran inactivas. Bloquea las de la competencia: no se pueden activar por error ni con «Activar todas».
            </p>
          </div>
          {editable && (
            <div className="flex flex-wrap gap-2">
              <form action={bulkStoreState}>
                <input type="hidden" name="client" value={client.slug} />
                <input type="hidden" name="action" value="activate" />
                <button className={btnStyle(true)} disabled={!toActivate}>Activar todas ({toActivate})</button>
              </form>
              <form action={bulkStoreState}>
                <input type="hidden" name="client" value={client.slug} />
                <input type="hidden" name="action" value="deactivate" />
                <button className={btnStyle()} disabled={!toDeactivate}>Desactivar todas ({toDeactivate})</button>
              </form>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Filtrar por estado" className="flex flex-wrap gap-1">
            {STATE_FILTERS.map((f) => (
              <Link key={f.id} href={href({ estado: f.id })} aria-current={filter === f.id ? "true" : undefined}
                className={`flex min-h-9 items-center rounded-md px-3 text-sm ${filter === f.id ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "border border-neutral-300 dark:border-neutral-700"}`}>
                {f.label}{f.state ? ` · ${count(f.state)}` : ""}
              </Link>
            ))}
          </nav>
          <Link href={href(onlyLive ? { cupones: "todas" } : { cupones: "" })} className="text-sm text-blue-700 hover:underline dark:text-blue-400">
            {onlyLive ? "Ver también las que no tienen cupones" : "Solo las que tienen cupones"}
          </Link>
          <form className="ml-auto">
            <input type="hidden" name="estado" value={filter} />
            {!onlyLive && <input type="hidden" name="cupones" value="todas" />}
            <label className="sr-only" htmlFor="store-q">Buscar tienda</label>
            <input id="store-q" name="q" defaultValue={q} placeholder="Buscar tienda…" className="min-h-9 w-52 rounded-md border border-neutral-300 bg-white px-3 text-sm dark:border-neutral-700 dark:bg-neutral-900" />
          </form>
        </div>
      </div>
      <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {shown.map((r) => (
          <li key={r.storeId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-2.5 text-sm">
            <span className="w-44 font-medium">{r.name}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE[r.state]}`}>{STATE_LABEL[r.state]}</span>
            <span className="w-24 text-neutral-500 tabular-nums">{r.live ? `${r.live} cupones` : "sin cupones"}</span>
            {r.state === "active" && (
              <span className="flex gap-3">
                <Link href={`/panel/pages/${client.slug}/${r.slug}?desde=cliente`} className="text-blue-700 hover:underline dark:text-blue-300">Generador</Link>
                <a href={`/p/${client.slug}/${r.slug}`} target="_blank" className="text-blue-700 hover:underline dark:text-blue-300">Ver página ↗</a>
              </span>
            )}
            {editable && (
              <span className="ml-auto flex flex-wrap gap-2">
                {ACTIONS[r.state].map((a) => (
                  <form key={a.action} action={setStoreState}>
                    <input type="hidden" name="client" value={client.slug} />
                    <input type="hidden" name="store" value={r.slug} />
                    <input type="hidden" name="action" value={a.action} />
                    <button className={btnStyle(a.primary, a.action === "block")} aria-label={`${a.label} ${r.name} en ${client.name}`}>{a.label}</button>
                  </form>
                ))}
              </span>
            )}
          </li>
        ))}
        {shown.length === 0 && <li className="px-5 py-6 text-sm text-neutral-500">Ninguna tienda con este filtro.</li>}
      </ul>
    </section>
  );
}
