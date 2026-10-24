import Link from "next/link";
import { redirect } from "next/navigation";
import { canEdit, requireUser } from "@/lib/auth";
import { importAwinOffers } from "@/app/actions-pages";
import { listAllCoupons, listClients, listStores } from "@/lib/db";
import { fetchOffers } from "@/lib/awin-demo";
import { btnCls, cardCls, PageHeader } from "@/app/ui";

export default async function AwinPage({ searchParams }: PageProps<"/awin">) {
  if (!canEdit(await requireUser())) redirect("/");
  const [sp, stores, coupons, clients] = await Promise.all([searchParams, listStores(), listAllCoupons(), listClients()]);
  const imported = new Set(coupons.map((c) => c.awin_offer_id).filter(Boolean));
  const only = typeof sp.store === "string" ? sp.store : "";
  const awin = stores.filter((s) => s.network === "awin");
  const merchants = awin.filter((s) => s.awin_merchant_id && (!only || s.slug === only));
  const missing = awin.filter((s) => !s.awin_merchant_id);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Awin" title="Redes de afiliación" />

      <div className="flex flex-wrap gap-4">
        <section className={`${cardCls} flex min-w-0 flex-[1_1_320px] flex-col gap-2`}>
          <h2 className="font-semibold">Conexión</h2>
          <p className="flex items-center gap-2 text-sm">
            <span className="size-2.5 rounded-full bg-amber-500" aria-hidden="true" />
            Modo demo: catálogo de ofertas de ejemplo
          </p>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Con un token de publisher de Awin, esta pantalla lee las promociones reales de cada anunciante y los informes de clics y comisiones por medio.
          </p>
        </section>
        <section className={`${cardCls} flex min-w-0 flex-[1_1_320px] flex-col gap-2`}>
          <h2 className="font-semibold">Atribución por medio</h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Cada enlace lleva el <code className="font-mono">awinaffid</code> del medio y un <code className="font-mono">clickref</code> medio-tienda-cupón.
          </p>
          <p className="text-sm">
            {clients.filter((c) => c.awin_affiliate_id).length} de {clients.length} medios con affiliate ID ·{" "}
            <Link href="/clients" className="text-blue-700 hover:underline dark:text-blue-300">revisar</Link>
          </p>
        </section>
      </div>

      {missing.length > 0 && !only && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Sin merchant ID (no se pueden importar): {missing.map((s) => <Link key={s.id} href={`/stores/${s.slug}?tab=contenido`} className="mr-2 underline">{s.name}</Link>)}
        </p>
      )}

      {only && <Link href="/awin" className="text-sm text-blue-700 hover:underline dark:text-blue-300">← Ver todas las tiendas</Link>}

      {merchants.map((s) => {
        const offers = fetchOffers(s.awin_merchant_id);
        const fresh = offers.filter((o) => !imported.has(o.id));
        return (
          <section key={s.id} aria-labelledby={`m-${s.id}`} className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
            <form action={importAwinOffers}>
              <input type="hidden" name="store" value={s.slug} />
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-neutral-50 px-5 py-3 dark:border-neutral-800 dark:bg-neutral-900">
                <h2 id={`m-${s.id}`} className="font-semibold">
                  <Link href={`/stores/${s.slug}`} className="hover:underline">{s.name}</Link>
                  <span className="ml-2 font-mono text-xs font-normal text-neutral-500">merchant {s.awin_merchant_id}</span>
                </h2>
                <span className="text-sm text-neutral-600 dark:text-neutral-400">{fresh.length} nuevas de {offers.length}</span>
              </div>
              <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {offers.map((o) => {
                  const done = imported.has(o.id);
                  return (
                    <li key={o.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                      <input type="checkbox" name="offers" value={o.id} defaultChecked={!done} disabled={done} aria-label={`Importar ${o.title}`} className="size-4" />
                      <span className="w-16 font-bold">{o.discount}</span>
                      <span className="flex flex-1 flex-col">
                        <span className={done ? "text-neutral-500" : "font-medium"}>{o.title}</span>
                        <span className="text-xs text-neutral-500">{o.code ? `Código ${o.code} · ` : ""}{o.expires ? `Caduca ${o.expires}` : "Sin fecha"}</span>
                      </span>
                      {done && <span className="text-xs text-green-700 dark:text-green-400">Importada</span>}
                    </li>
                  );
                })}
              </ul>
              {fresh.length > 0 && (
                <div className="border-t border-neutral-200 px-5 py-3 dark:border-neutral-800">
                  <button className={`${btnCls} min-h-10`}>Importar seleccionadas</button>
                </div>
              )}
            </form>
          </section>
        );
      })}
    </div>
  );
}
