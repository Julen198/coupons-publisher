import Link from "next/link";
import { StoreMark } from "@/app/store-mark";
import { FindCouponsButton } from "../../coupons/find-coupons-button";
import { networkLabel, storeTracked } from "@/lib/affiliate";
import { notFound } from "next/navigation";
import { verifyCoupons } from "@/app/actions";
import { canEdit, onlyVisible, requireUser } from "@/lib/auth";
import { getStore, listCoupons, listPages, listStores } from "@/lib/db";
import { expiresSoon, statusOf, today } from "@/lib/coupon-status";
import { coverageOf, DELIVERY_LABEL } from "@/lib/page-status";
import { btnCls, btnSecondaryCls, CoverageBadge, PageHeader } from "@/app/ui";
import { CouponForm, type CouponDraft } from "@/app/(panel)/coupons/coupon-form";
import { StoreContentForm } from "./store-content-form";

const TABS = [
  { id: "cupones", label: "Cupones" },
  { id: "contenido", label: "Contenido y FAQs" },
  { id: "medios", label: "Medios" },
] as const;

const BADGES = {
  ok: ["Verificado", "bg-green-100 text-green-900 dark:bg-green-900 dark:text-green-100"],
  pending: ["Sin verificar", "bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100"],
  expired: ["Caducado", "bg-red-100 text-red-900 dark:bg-red-900 dark:text-red-100"],
  archived: ["Retirado", "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"],
} as const;

export default async function StorePage({ params, searchParams }: PageProps<"/stores/[slug]">) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const [store, stores, allPages] = await Promise.all([getStore(slug), listStores(), listPages()]);
  if (!store) notFound();
  const coupons = await listCoupons(store.id);
  const user = await requireUser();
  const editable = canEdit(user);
  const pages = onlyVisible(user, allPages).filter((p) => p.store_id === store.id);
  const tab = TABS.find((x) => x.id === sp.tab)?.id ?? "cupones";
  const t = today();
  const now = new Date();
  const back = `/stores/${store.slug}?tab=cupones`;

  const editing = sp.edit ? coupons.find((c) => c.id === Number(sp.edit)) : undefined;
  const draft: CouponDraft | undefined = editing
    ? {
        id: editing.id, store_id: editing.store_id, kind: editing.kind, title: editing.title, code: editing.code,
        discount: editing.discount, description: editing.description, target_url: editing.target_url,
        expires_at: editing.expires_at, verified: Boolean(editing.verified),
      }
    : sp.new !== undefined
      ? { store_id: store.id, kind: "code", title: "", code: "", discount: "", description: "", target_url: store.website, expires_at: "", verified: false }
      : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/stores" className="text-sm text-neutral-500 hover:underline">← Tiendas</Link>
        <div className="flex items-center gap-4">
        <StoreMark slug={store.slug} name={store.name} hasLogo={store.has_logo} size="lg" />
        <div className="min-w-0 flex-1">
        <PageHeader
          title={store.name}
          eyebrow={
            <span className="flex flex-wrap gap-x-4">
              <a href={store.website} target="_blank" className="text-blue-700 hover:underline dark:text-blue-300">{store.website.replace(/^https?:\/\//, "")}</a>
              <span>
                {networkLabel(store.network)}
                {store.network === "awin" ? <> merchant <span className="font-mono">{store.awin_merchant_id || "—"}</span></> : storeTracked(store) ? " · con enlace" : " · sin enlace de seguimiento"}
              </span>
              <span>Publicada en {pages.filter((p) => p.status === "published").length} medios</span>
            </span>
          }
        >
          {editable && store.network === "awin" && store.awin_merchant_id && <Link href={`/awin?store=${store.slug}`} className={btnSecondaryCls}>Importar de redes de afiliación</Link>}
          {editable && <FindCouponsButton stores={[{ id: store.id, name: store.name, coupons: coupons.filter((c) => !c.archived).length }]} label="Buscar cupones en internet" />}
          {editable && <Link href={{ query: { tab: "cupones", new: "" } }} className={btnCls}>+ Añadir cupón</Link>}
        </PageHeader>
        </div>
        </div>
      </div>

      <nav aria-label="Secciones de la tienda" className="flex flex-wrap gap-1 border-b border-neutral-200 dark:border-neutral-800">
        {TABS.map((x) => (
          <Link
            key={x.id}
            href={{ query: { tab: x.id } }}
            aria-current={tab === x.id ? "page" : undefined}
            className={`-mb-px flex min-h-11 items-center border-b-2 px-3 text-sm ${tab === x.id ? "border-blue-700 font-semibold text-blue-900 dark:border-blue-400 dark:text-blue-200" : "border-transparent text-neutral-600 dark:text-neutral-400"}`}
          >
            {x.label}
            {x.id === "cupones" && ` · ${coupons.filter((c) => !c.archived).length}`}
            {x.id === "medios" && ` · ${pages.length}`}
          </Link>
        ))}
      </nav>

      {tab === "cupones" && (
        <div className="flex flex-wrap items-start gap-6">
          <div className="min-w-0 flex-[999_1_560px] overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
            {coupons.map((c) => (
              <form key={c.id} id={`verify-${c.id}`} action={verifyCoupons} hidden>
                <input type="hidden" name="ids" value={c.id} />
              </form>
            ))}
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-neutral-50 text-left text-xs text-neutral-500 dark:bg-neutral-900">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Dto.</th>
                  <th className="px-2 py-2.5 font-semibold">Cupón</th>
                  <th className="px-2 py-2.5 font-semibold">Código</th>
                  <th className="px-2 py-2.5 font-semibold">Estado</th>
                  <th className="px-2 py-2.5 font-semibold">Caduca</th>
                  <th className="px-4 py-2.5"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {coupons.map((c) => {
                  const st = statusOf(c, t);
                  return (
                    <tr key={c.id} className={editing?.id === c.id ? "bg-blue-50 dark:bg-blue-950" : undefined}>
                      <td className="px-4 py-2.5 text-base font-bold whitespace-nowrap">{c.discount}</td>
                      <td className="px-2 py-2.5">
                        <span className="flex flex-col"><span className="font-medium">{c.title}</span>
                          <span className="text-xs text-neutral-500">{c.description}{c.source === "awin" && " · Importado de Awin"}</span></span>
                      </td>
                      <td className="px-2 py-2.5">{c.kind === "code" ? <code className="rounded border border-dashed border-neutral-400 bg-neutral-50 px-2 py-0.5 font-mono text-xs dark:bg-neutral-900">{c.code}</code> : <span className="text-xs text-neutral-500">Oferta</span>}</td>
                      <td className="px-2 py-2.5"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${BADGES[st][1]}`}>{BADGES[st][0]}</span></td>
                      <td className={`px-2 py-2.5 text-xs whitespace-nowrap ${expiresSoon(c, t) ? "font-semibold text-orange-800 dark:text-orange-300" : "text-neutral-500"}`}>{c.expires_at || "Sin fecha"}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        {st === "pending" && <button form={`verify-${c.id}`} className="mr-1 min-h-9 rounded-md border border-green-700 px-2.5 text-xs text-green-900 dark:text-green-300">Verificar</button>}
                        <Link href={{ query: { tab: "cupones", edit: c.id } }} aria-label={`Editar ${c.title}`} className="inline-flex size-9 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">✎</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {coupons.length === 0 && <p className="p-8 text-center text-sm text-neutral-500">Esta tienda aún no tiene cupones.</p>}
          </div>
          {editable && draft && (
            <CouponForm key={draft.id ?? "new"} initial={draft} stores={stores.map(({ id, name, website }) => ({ id, name, website }))} back={back} />
          )}
        </div>
      )}

      {tab === "contenido" && (
        <StoreContentForm
          store={{ slug: store.slug, name: store.name, website: store.website, network: store.network, awin_merchant_id: store.awin_merchant_id, tracking_url: store.tracking_url, intro: store.intro, faqs: store.faqs }}
          discounts={coupons.filter((c) => !c.archived && statusOf(c, t) !== "expired").map((c) => c.discount)}
        />
      )}

      {tab === "medios" && (
        <ul className="divide-y divide-neutral-200 overflow-hidden rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {pages.map((p) => (
            <li key={p.client_id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 text-sm">
              <Link href={`/clients/${p.client_slug}`} className="w-48 font-medium hover:underline">{p.client_name}</Link>
              <CoverageBadge coverage={coverageOf(p, now)} />
              <span className="text-neutral-500">{DELIVERY_LABEL[p.delivery]}</span>
              <Link href={`/pages/${p.client_slug}/${store.slug}`} className="ml-auto text-blue-700 hover:underline dark:text-blue-300">Generador</Link>
            </li>
          ))}
          {pages.length === 0 && <li className="px-5 py-6 text-sm text-neutral-500">Ningún medio la publica todavía. Añádela desde la ficha de un cliente.</li>}
        </ul>
      )}
    </div>
  );
}
