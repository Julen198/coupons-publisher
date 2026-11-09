import Link from "next/link";
import { Combobox } from "@/app/combobox";
import { onlyVisible, requireUser } from "@/lib/auth";
import { listClients, listPages } from "@/lib/db";
import { coverageOf, DELIVERY_LABEL, type Coverage } from "@/lib/page-status";
import { ClearFilters, CoverageBadge, fmtDateTime, PageHeader } from "@/app/ui";

const FILTERS: { id: Coverage | "all"; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "live", label: "Publicadas" },
  { id: "stale", label: "Desactualizadas" },
  { id: "draft", label: "Borradores" },
];

export default async function PagesPage({ searchParams }: PageProps<"/panel/pages">) {
  const user = await requireUser();
  const [sp, allPages, allClients] = await Promise.all([searchParams, listPages(), listClients()]);
  const pages = onlyVisible(user, allPages);
  const clients = onlyVisible(user, allClients, "id");
  const now = new Date();
  const filter = FILTERS.find((f) => f.id === sp.coverage)?.id ?? "all";
  const clientSlug = typeof sp.client === "string" ? sp.client : "";
  const rows = pages
    .map((p) => ({ ...p, coverage: coverageOf(p, now) }))
    .filter((p) => (filter === "all" || p.coverage === filter) && (!clientSlug || p.client_slug === clientSlug));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={`${pages.length} páginas de ${clients.length} clientes`} title="Páginas" />
      <p className="max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
        Cada página es una tienda activa en un medio. Para activar o bloquear tiendas, entra en la ficha del cliente.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <nav aria-label="Filtrar por estado" className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <Link
              key={f.id}
              href={{ query: { ...(clientSlug && { client: clientSlug }), coverage: f.id } }}
              aria-current={filter === f.id ? "true" : undefined}
              className={`flex min-h-10 items-center rounded-md px-3 text-sm ${filter === f.id ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "border border-neutral-300 dark:border-neutral-700"}`}
            >
              {f.label}
            </Link>
          ))}
        </nav>
        <form className="flex items-end gap-2">
          <input type="hidden" name="coverage" value={filter} />
          <div className="flex w-60 flex-col gap-1 text-xs text-neutral-500">
            <span aria-hidden="true">Cliente</span>
            <Combobox
              name="client"
              label="Cliente"
              defaultValue={clientSlug}
              placeholder="Todos los clientes"
              allLabel="Todos los clientes"
              searchPlaceholder="Buscar cliente…"
              emptyText="Ningún cliente con ese nombre."
              options={clients.map((c) => ({ value: c.slug, label: c.name }))}
              submitOnClear
            />
          </div>
          <button className="min-h-10 rounded-md border border-neutral-300 px-3 text-sm dark:border-neutral-700">Filtrar</button>
          {(clientSlug || filter !== "all") && <ClearFilters href="/panel/pages" />}
        </form>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs text-neutral-500 dark:bg-neutral-900">
            <tr>
              <th className="px-4 py-3 font-semibold">Cliente</th>
              <th className="px-2 py-3 font-semibold">Tienda</th>
              <th className="px-2 py-3 font-semibold">Entrega</th>
              <th className="px-2 py-3 font-semibold">Estado</th>
              <th className="px-2 py-3 font-semibold">Publicada</th>
              <th className="px-4 py-3 text-right font-semibold"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {rows.map((p) => (
              <tr key={`${p.client_id}-${p.store_id}`}>
                <td className="px-4 py-3 font-medium"><Link href={`/panel/clients/${p.client_slug}`} className="hover:underline">{p.client_name}</Link></td>
                <td className="px-2 py-3"><Link href={`/panel/stores/${p.store_slug}`} className="hover:underline">{p.store_name}</Link></td>
                <td className="px-2 py-3 text-neutral-600 dark:text-neutral-400">{DELIVERY_LABEL[p.delivery]}</td>
                <td className="px-2 py-3"><CoverageBadge coverage={p.coverage} /></td>
                <td className="px-2 py-3 text-xs text-neutral-500">{p.published_at ? fmtDateTime(p.published_at) : "—"}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <Link href={`/panel/pages/${p.client_slug}/${p.store_slug}`} className="mr-3 text-blue-700 hover:underline dark:text-blue-300">Abrir</Link>
                  <a href={`/p/${p.client_slug}/${p.store_slug}`} target="_blank" className="text-blue-700 hover:underline dark:text-blue-300">Ver ↗</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-8 text-center text-sm text-neutral-500">No hay páginas con este filtro.</p>}
      </div>
    </div>
  );
}
