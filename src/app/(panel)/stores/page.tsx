import Link from "next/link";
import { StoreMark } from "@/app/store-mark";
import { AddStoresButton } from "./add-stores-button";
import { NETWORKS, networkLabel, storeTracked } from "@/lib/affiliate";
import { filterStores, paginate, type StoreFilters } from "@/lib/store-filter";
import { canEdit, requireUser } from "@/lib/auth";
import { listAllCoupons, listPages, listStores } from "@/lib/db";
import { isPublic, statusOf, today } from "@/lib/coupon-status";
import { publishUnverified } from "@/lib/settings";
import { ClearFilters, inputCls, PageHeader, Pager } from "@/app/ui";
import { SearchInput } from "@/app/search-input";

const PAGE_SIZE = 15;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function StoresPage({ searchParams }: PageProps<"/stores">) {
  const user = await requireUser();
  const sp = await searchParams;
  const [stores, coupons, pages, unverified] = await Promise.all([listStores(), listAllCoupons(), listPages(), publishUnverified()]);
  const t = today();

  const filters: StoreFilters = {
    q: one(sp.q),
    network: NETWORKS.some((n) => n.id === one(sp.red)) ? one(sp.red) : undefined,
    tracking: one(sp.tracking) === "ok" || one(sp.tracking) === "missing" ? (one(sp.tracking) as StoreFilters["tracking"]) : undefined,
    coupons: one(sp.cupones) === "some" || one(sp.cupones) === "none" ? (one(sp.cupones) as StoreFilters["coupons"]) : undefined,
  };
  // visible on clients' pages vs. found on the web and waiting for someone to verify them
  const live = new Map<number, number>();
  const review = new Map<number, number>();
  for (const c of coupons) {
    const bucket = isPublic(c, t, unverified) ? live : c.source === "web" && !c.verified && statusOf(c, t) === "pending" ? review : null;
    bucket?.set(c.store_id, (bucket.get(c.store_id) ?? 0) + 1);
  }
  const anyCoupons = new Map(stores.map((s) => [s.id, (live.get(s.id) ?? 0) + (review.get(s.id) ?? 0)]));
  const filtered = filterStores([...stores], filters, anyCoupons);
  const { rows, page, pages: pageCount, from, to } = paginate(filtered, Number(one(sp.page)), PAGE_SIZE);
  const active = Boolean(filters.q || filters.network || filters.tracking || filters.coupons);
  // keeps the current filters when moving between pages
  const pageHref = (n: number) => {
    const q = new URLSearchParams(Object.entries({ q: filters.q, red: filters.network, tracking: filters.tracking, cupones: filters.coupons }).filter((e): e is [string, string] => !!e[1]));
    if (n > 1) q.set("page", String(n));
    return `/stores${q.size ? `?${q}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={`${stores.length} anunciantes`} title="Tiendas">
        {canEdit(user) && <AddStoresButton />}
      </PageHeader>
      <div className="min-w-0 overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
        <form className="flex flex-wrap items-end gap-3 border-b border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <label className="flex min-w-0 flex-[1_1_220px] flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400">
            Buscar
            <SearchInput name="q" defaultValue={filters.q} placeholder="Nombre o web" submitOnClear />
          </label>
          <label className="flex flex-[0_1_170px] flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400">
            Red
            <select name="red" defaultValue={filters.network ?? ""} className={inputCls}>
              <option value="">Todas</option>
              {NETWORKS.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
            </select>
          </label>
          <label className="flex flex-[0_1_190px] flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400">
            Tracking
            <select name="tracking" defaultValue={filters.tracking ?? ""} className={inputCls}>
              <option value="">Todas</option>
              <option value="missing">Sin merchant ID o enlace</option>
              <option value="ok">Con tracking</option>
            </select>
          </label>
          <label className="flex flex-[0_1_170px] flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400">
            Cupones
            <select name="cupones" defaultValue={filters.coupons ?? ""} className={inputCls}>
              <option value="">Todas</option>
              <option value="some">Con cupones</option>
              <option value="none">Sin cupones</option>
            </select>
          </label>
          <button className="min-h-10 rounded-md border border-neutral-300 px-4 text-sm dark:border-neutral-700">Filtrar</button>
          {active && <ClearFilters href="/stores" />}
        </form>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-neutral-50 text-left text-xs text-neutral-500 dark:bg-neutral-900">
              <tr>
                <th className="px-4 py-3 font-semibold">Tienda</th>
                <th className="px-2 py-3 font-semibold">Red</th>
                <th className="px-2 py-3 font-semibold">Cupones</th>
                <th className="px-4 py-3 font-semibold">Medios</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {rows.map((s) => (
                <tr key={s.id}>
                  <th scope="row" className="px-4 py-3 text-left font-medium">
                    <Link href={`/stores/${s.slug}`} className="flex items-center gap-3 hover:underline">
                      <StoreMark slug={s.slug} name={s.name} hasLogo={s.has_logo} size="md" />
                      <span className="flex flex-col">{s.name}<span className="text-xs font-normal text-neutral-500">{s.website.replace(/^https?:\/\//, "")}</span></span>
                    </Link>
                  </th>
                  <td className="px-2 py-3 text-xs">
                    {networkLabel(s.network)}
                    {s.network === "awin" && s.awin_merchant_id && <span className="ml-1 font-mono text-neutral-500">{s.awin_merchant_id}</span>}
                    {!storeTracked(s) && <span className="ml-1 text-amber-700 dark:text-amber-400">{s.network === "awin" ? "· sin merchant ID" : "· sin enlace"}</span>}
                  </td>
                  <td className="px-2 py-3">
                    <Link href={`/coupons?store=${s.slug}`} className="flex flex-col hover:underline">
                      <span>{live.get(s.id) ?? 0} visibles</span>
                      {(review.get(s.id) ?? 0) > 0 && <span className="text-xs text-amber-800 dark:text-amber-300">{review.get(s.id)} por revisar</span>}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{pages.filter((p) => p.store_id === s.id && p.status === "published").length}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {stores.length === 0 && <p className="p-8 text-center text-sm text-neutral-500">Aún no hay tiendas. Cada tienda es un anunciante (adidas, Decathlon…) con sus cupones.</p>}
          {stores.length > 0 && rows.length === 0 && <p className="p-8 text-center text-sm text-neutral-500">Ninguna tienda coincide con los filtros.</p>}
        </div>
        <Pager from={from} to={to} total={filtered.length} page={page} pages={pageCount} href={pageHref} />
      </div>
    </div>
  );
}

