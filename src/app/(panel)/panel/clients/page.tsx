import Link from "next/link";
import { ClientMark } from "./client-mark";
import { onlyVisible, requireUser } from "@/lib/auth";
import { listClients, listPages } from "@/lib/db";
import { btnCls, ClearFilters } from "@/app/ui";
import { SearchInput } from "@/app/search-input";

const FILTERS = [
  { id: "all", label: "Todos" },
  { id: "ready", label: "Estilo listo" },
  { id: "bare", label: "Genérico" },
] as const;

export default async function ClientsPage({ searchParams }: PageProps<"/panel/clients">) {
  const sp = await searchParams;
  const q = String(sp.q ?? "").trim().toLowerCase();
  const filter = FILTERS.some((f) => f.id === sp.filter) ? String(sp.filter) : "all";
  const user = await requireUser();
  const [allClients, pages] = await Promise.all([listClients(), listPages()]);
  const clients = onlyVisible(user, allClients, "id");
  const dressed = (c: (typeof clients)[number]) => Boolean(c.logo_url || c.nav_items);
  const rows = clients
    .filter((c) => !q || c.name.toLowerCase().includes(q) || c.domain.includes(q))
    .filter((c) => filter === "all" || (filter === "ready") === dressed(c));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-neutral-500">{clients.length} medios</p>
          <h1 className="text-2xl font-semibold">Clientes</h1>
        </div>
        {user.role === "admin" && <Link href="/panel/clients/new" className={btnCls}>+ Nuevo cliente</Link>}
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <form className="flex flex-1 basis-64 flex-col gap-1 text-xs text-neutral-500">
          <label htmlFor="q">Buscar</label>
          <SearchInput id="q" name="q" defaultValue={q} placeholder="Nombre o dominio" submitOnClear />
          <input type="hidden" name="filter" value={filter} />
        </form>
        <nav aria-label="Filtrar por estilo de la demo" className="flex gap-1">
          {FILTERS.map((f) => (
            <Link
              key={f.id}
              href={{ query: { ...(q && { q }), filter: f.id } }}
              aria-current={filter === f.id ? "true" : undefined}
              className={`flex min-h-10 items-center rounded-md px-3 text-sm ${
                filter === f.id
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "border border-neutral-300 dark:border-neutral-700"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </nav>
        {(q || filter !== "all") && <ClearFilters href="/panel/clients" />}
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs text-neutral-500 dark:bg-neutral-900">
            <tr>
              <th className="px-4 py-3 font-semibold">Medio</th>
              <th className="px-2 py-3 font-semibold">Awin ID</th>
              <th className="px-2 py-3 font-semibold">Clickref</th>
              <th className="px-2 py-3 font-semibold">Páginas</th>
              <th className="px-2 py-3 font-semibold">Estilo de la demo</th>
              <th className="px-4 py-3 text-right font-semibold">Demo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {rows.map((c) => (
              <tr key={c.id}>
                <th scope="row" className="px-4 py-3 text-left font-medium">
                  <Link href={`/panel/clients/${c.slug}`} className="flex items-center gap-3 hover:underline">
                    <ClientMark name={c.name} logoUrl={c.logo_url} color={c.brand_color} size="sm" />
                    <span className="flex flex-col">
                      {c.name}
                      <span className="text-xs font-normal text-neutral-500">{c.domain}</span>
                    </span>
                  </Link>
                </th>
                <td className="px-2 py-3 font-mono text-xs">{c.awin_affiliate_id || "—"}</td>
                <td className="px-2 py-3 font-mono text-xs">{c.clickref_prefix || "—"}</td>
                <td className="px-2 py-3">{pages.filter((p) => p.client_id === c.id && p.status === "published").length} publicadas</td>
                <td className="px-2 py-3">
                  {dressed(c) ? (
                    <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-900 dark:bg-green-900 dark:text-green-100">Listo</span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-900 dark:text-amber-100">Genérico</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <a href={`/demo/${c.slug}`} target="_blank" className="font-mono text-xs text-blue-700 hover:underline dark:text-blue-300">
                    /demo/{c.slug} ↗
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-8 text-center text-sm text-neutral-500">{clients.length ? "Ningún cliente coincide con la búsqueda." : "Aún no hay clientes. Cada cliente es un medio que publicará tus páginas de cupones."}</p>}
      </div>
    </div>
  );
}
