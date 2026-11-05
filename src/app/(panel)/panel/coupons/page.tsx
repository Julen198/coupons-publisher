import Link from "next/link";
import { StoreMark } from "@/app/store-mark";
import { BulkBar } from "./bulk-bar";
import { networkLabel } from "@/lib/affiliate";
import { publishUnverified } from "@/lib/settings";
import { Combobox } from "@/app/combobox";
import { FindCouponsButton } from "./find-coupons-button";
import { verifyCoupons } from "@/app/actions";
import { canEdit, requireUser } from "@/lib/auth";
import { listAllCoupons, listStores, type CouponWithStore } from "@/lib/db";
import { daysUntil, expiresSoon, matchesFilter, statusOf, today, type StatusFilter } from "@/lib/coupon-status";
import { btnCls, btnSecondaryCls, ClearFilters, Pager } from "@/app/ui";
import { SearchInput } from "@/app/search-input";
import { paginate } from "@/lib/store-filter";
import { CouponForm, type CouponDraft } from "./coupon-form";

const TILES: { id: StatusFilter; label: string; dot: string }[] = [
  { id: "all", label: "Activos", dot: "bg-blue-700" },
  { id: "ok", label: "Verificados", dot: "bg-green-700" },
  { id: "pending", label: "Sin verificar", dot: "bg-amber-500" },
  { id: "soon", label: "Caducan en 7 días", dot: "bg-orange-700" },
  { id: "expired", label: "Caducados", dot: "bg-red-700" },
  { id: "archived", label: "Retirados", dot: "bg-neutral-400" },
];

const BADGES = {
  ok: ["Verificado", "bg-green-100 text-green-900 dark:bg-green-900 dark:text-green-100"],
  pending: ["Sin verificar", "bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100"],
  expired: ["Caducado", "bg-red-100 text-red-900 dark:bg-red-900 dark:text-red-100"],
  archived: ["Retirado", "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"],
} as const;

const PAGE_SIZE = 15;
const couponCount = (n: number) => `${n} ${n === 1 ? "cupón" : "cupones"}`;
const norm = (v: string) => v.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
const hostOf = (url: string) => (URL.canParse(url) ? new URL(url).hostname.replace(/^www\./, "") : url);

const fmtDate = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

function expiryLabel(c: CouponWithStore, t: string) {
  if (!c.expires_at) return "Sin fecha";
  const days = daysUntil(c.expires_at, t);
  if (statusOf(c, t) !== "expired" && days === 0) return "Hoy";
  if (expiresSoon(c, t)) return `En ${days} días`;
  return fmtDate(c.expires_at);
}

export default async function CouponsPage({ searchParams }: PageProps<"/panel/coupons">) {
  const sp = await searchParams;
  const user = await requireUser();
  const editable = canEdit(user);
  const [coupons, stores, unverified] = await Promise.all([listAllCoupons(), listStores(), publishUnverified()]);
  const t = today();

  const q = String(sp.q ?? "").trim();
  // the store box takes a typed name (from the datalist) or a slug from a link; both resolve to the store
  const storeInput = String(sp.store ?? "").trim();
  const storeMatch = storeInput ? stores.find((s) => s.slug === storeInput || norm(s.name) === norm(storeInput)) : undefined;
  const storeSlug = storeMatch?.slug ?? storeInput;
  const status = (TILES.some((x) => x.id === sp.status) ? sp.status : "all") as StatusFilter;
  const filters = { ...(q && { q }), ...(storeSlug && { store: storeSlug }), ...(status !== "all" && { status }) };

  const filtered = coupons.filter(
    (c) =>
      matchesFilter(c, status, t) &&
      (!storeSlug || c.store_slug === storeSlug) &&
      (!q || `${c.title} ${c.code}`.toLowerCase().includes(q.toLowerCase())),
  );
  const { rows, page, pages, from, to } = paginate(filtered, Number(sp.page), PAGE_SIZE);
  // filters + page, so editing a coupon or going back keeps you on the same page
  const here = { ...filters, ...(page > 1 && { page: String(page) }) };
  const pageHref = (n: number) => `/panel/coupons?${new URLSearchParams({ ...filters, ...(n > 1 && { page: String(n) }) })}`;
  const perStore = new Map<number, number>();
  for (const c of coupons) if (!c.archived) perStore.set(c.store_id, (perStore.get(c.store_id) ?? 0) + 1);
  const count = (f: StatusFilter) => coupons.filter((c) => matchesFilter(c, f, t)).length;

  const back = `/panel/coupons?${new URLSearchParams(here)}`;
  const editing = sp.edit ? coupons.find((c) => c.id === Number(sp.edit)) : undefined;
  const draft: CouponDraft | undefined = editing
    ? {
        id: editing.id, store_id: editing.store_id, kind: editing.kind, title: editing.title, code: editing.code,
        discount: editing.discount, description: editing.description, target_url: editing.target_url,
        expires_at: editing.expires_at, verified: Boolean(editing.verified),
      }
    : sp.new !== undefined && stores[0]
      ? { store_id: stores[0].id, kind: "code", title: "", code: "", discount: "", description: "", target_url: stores[0].website, expires_at: "", verified: false }
      : undefined;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-neutral-500">{count("all")} cupones activos en {stores.length} tiendas</p>
          <h1 className="text-2xl font-semibold">Cupones</h1>
        </div>
        {editable && <div className="flex flex-wrap gap-2">
          <Link href="/panel/networks" className={btnSecondaryCls}>Importar de redes de afiliación</Link>
          <FindCouponsButton stores={stores.map((s) => ({ id: s.id, name: s.name, coupons: coupons.filter((c) => c.store_id === s.id && !c.archived).length }))} />
          <Link href={{ query: { ...here, new: "" } }} className={btnCls}>+ Nuevo cupón</Link>
        </div>}
      </header>

      {unverified && (
        <p role="status" className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          Modo demo activo: los cupones sin verificar también se publican. Desactívalo en Administración → Datos antes de trabajar con clientes reales.
        </p>
      )}

      <nav aria-label="Estados" className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        {TILES.map((tile) => (
          <Link
            key={tile.id}
            href={{ query: { ...filters, status: tile.id } }}
            aria-current={status === tile.id ? "true" : undefined}
            className={`flex flex-col gap-1 rounded-lg px-4 py-3 ${status === tile.id ? "border-2 border-blue-700 bg-blue-50 dark:bg-blue-950" : "border border-neutral-200 dark:border-neutral-800"}`}
          >
            <span className="text-sm text-neutral-600 dark:text-neutral-400">{tile.label}</span>
            <span className="flex items-center gap-2 text-2xl font-bold"><span className={`size-2.5 rounded-sm ${tile.dot}`} />{count(tile.id)}</span>
          </Link>
        ))}
      </nav>

      <div className="flex flex-wrap items-start gap-6">
        <section aria-label="Lista de cupones" className="min-w-0 flex-[999_1_600px] overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
          <form className="flex flex-wrap items-end gap-3 border-b border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <input type="hidden" name="status" value={status} />
            <label className="flex flex-1 basis-52 flex-col gap-1 text-xs text-neutral-500">
              Buscar
              <SearchInput name="q" defaultValue={q} placeholder="Título o código" submitOnClear />
            </label>
            <div className="flex basis-60 flex-col gap-1 text-xs text-neutral-500">
              <span aria-hidden="true">Tienda</span>
              <Combobox
                name="store"
                label="Tienda"
                defaultValue={storeMatch?.slug ?? ""}
                placeholder="Todas las tiendas"
                allLabel="Todas las tiendas"
                searchPlaceholder="Buscar tienda…"
                emptyText="Ninguna tienda con ese nombre."
                options={stores.map((s) => ({ value: s.slug, label: s.name, hint: couponCount(perStore.get(s.id) ?? 0) }))}
                submitOnClear
              />
            </div>
            <button className="min-h-10 rounded-md border border-neutral-300 px-4 text-sm dark:border-neutral-700">Filtrar</button>
            {(q || storeInput || status !== "all") && <ClearFilters href="/panel/coupons" />}
          </form>

          {/* one hidden form per row so "Verificar" only verifies that row, not the checked ones */}
          {rows.map((c) => (
            <form key={c.id} id={`verify-${c.id}`} action={verifyCoupons} hidden>
              <input type="hidden" name="ids" value={c.id} />
            </form>
          ))}

          {/* row checkboxes belong to this form; its actions live in the floating BulkBar */}
          <form id="bulk" hidden />
          {editable && <BulkBar />}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="text-left text-xs text-neutral-500">
                <tr>
                  <th className="w-10 py-2.5 pl-4"><span className="sr-only">Seleccionar</span></th>
                  <th className="px-2 py-2.5 font-semibold">Tienda</th>
                  <th className="px-2 py-2.5 font-semibold">Dto.</th>
                  <th className="px-2 py-2.5 font-semibold">Cupón</th>
                  <th className="px-2 py-2.5 font-semibold">Código</th>
                  <th className="px-2 py-2.5 font-semibold">Estado</th>
                  <th className="px-2 py-2.5 font-semibold">Caduca</th>
                  <th className="px-2 py-2.5 font-semibold">Fuente</th>
                  <th className="py-2.5 pr-4 pl-2"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {rows.map((c) => {
                  const st = statusOf(c, t);
                  const soon = expiresSoon(c, t);
                  return (
                    <tr key={c.id} className={editing?.id === c.id ? "bg-blue-50 dark:bg-blue-950" : undefined}>
                      <td className="py-2.5 pl-4"><input type="checkbox" name="ids" value={c.id} form="bulk" aria-label={`Seleccionar ${c.title}`} className="size-4" /></td>
                      <td className="px-2 py-2.5 whitespace-nowrap">
                        <span className="flex items-center gap-2">
                          <StoreMark slug={c.store_slug} name={c.store_name} hasLogo={c.store_has_logo} />
                          {c.store_name}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-base font-bold whitespace-nowrap">{c.discount}</td>
                      <td className="px-2 py-2.5"><span className="flex flex-col"><span className="font-medium">{c.title}</span><span className="text-xs text-neutral-500">{c.description}</span></span></td>
                      <td className="px-2 py-2.5">
                        {c.kind === "code" ? <code className="rounded border border-dashed border-neutral-400 bg-neutral-50 px-2 py-0.5 font-mono text-xs whitespace-nowrap dark:bg-neutral-900">{c.code}</code> : <span className="text-xs text-neutral-500">Oferta</span>}
                      </td>
                      <td className="px-2 py-2.5 whitespace-nowrap">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGES[st][1]}`}>{BADGES[st][0]}</span>
                      </td>
                      <td className={`px-2 py-2.5 text-xs whitespace-nowrap ${soon ? "font-semibold text-orange-800 dark:text-orange-300" : "text-neutral-500"}`}>{expiryLabel(c, t)}</td>
                      <td className="px-2 py-2.5 text-xs whitespace-nowrap text-neutral-600 dark:text-neutral-400">
                        {c.source === "web" ? (
                          <a
                            href={c.source_url || undefined}
                            target="_blank"
                            title={c.verified ? undefined : "Encontrado en internet: no sale en las páginas hasta que lo verifiques"}
                            className="underline"
                          >
                            {c.source_url ? `${hostOf(c.source_url)} ↗` : "Internet"}
                          </a>
                        ) : c.source === "manual" ? "Manual" : networkLabel(c.source)}
                      </td>
                      <td className="py-2.5 pr-4 pl-2 text-right whitespace-nowrap">
                        {st === "pending" && (
                          <button form={`verify-${c.id}`} className="mr-1 min-h-9 rounded-md border border-green-700 px-2.5 text-xs text-green-900 dark:text-green-300">Verificar</button>
                        )}
                        <Link href={{ query: { ...here, edit: c.id } }} aria-label={`Editar ${c.title}`} className="inline-flex size-9 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">✎</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && <p className="p-8 text-center text-sm text-neutral-500">{coupons.length ? "Ningún cupón coincide con los filtros." : stores.length ? "Aún no hay cupones. Añade el primero con «+ Nuevo cupón» o impórtalos de Awin." : "Aún no hay cupones. Primero crea una tienda en Tiendas."}</p>}
          </div>
          <Pager from={from} to={to} total={filtered.length} page={page} pages={pages} href={pageHref} />
        </section>

        {/* client components only take plain objects: pass just what the form needs */}
        {editable && draft && (
          <CouponForm
            key={draft.id ?? "new"}
            initial={draft}
            stores={stores.map(({ id, name, website }) => ({ id, name, website }))}
            back={back}
          />
        )}
      </div>
    </div>
  );
}
