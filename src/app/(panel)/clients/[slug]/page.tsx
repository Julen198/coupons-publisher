import Link from "next/link";
import { notFound } from "next/navigation";
import { updateClient } from "@/app/actions";
import { canEdit, canSeeClient, requireUser } from "@/lib/auth";
import { getClient, listAllCoupons, listPages, listStores, sql } from "@/lib/db";
import { adapterFor } from "@/lib/networks/index";
import { decryptJson } from "@/lib/secrets";
import type { Credentials } from "@/lib/networks/types";
import { coverageOf, DELIVERY_LABEL } from "@/lib/page-status";
import { btnCls, btnSecondaryCls, cardCls, CoverageBadge, Field, inputCls } from "@/app/ui";
import { StyleForm } from "./style-form";
import { RemovePageButton } from "./remove-page-button";
import { AddStoreButton } from "./add-store-form";
import { ClientMark } from "../client-mark";

interface AccountOption { id: number; network: string; own: boolean; value: string; ref: string }

// Connected network accounts this client can use: ours (client_id NULL) and the client's own.
// Only the non-secret id leaves the server (Awin publisher id, Admitad ad space…).
async function usableAccounts(clientId: number): Promise<AccountOption[]> {
  const rows = await sql()<{ id: number; network: string; client_id: number | null; account_ref: string; credentials: string }[]>`
    SELECT id, network, client_id, account_ref, credentials FROM network_accounts
    WHERE client_id IS NULL OR client_id = ${clientId} ORDER BY network, client_id NULLS LAST, id`;
  return rows.map((r) => {
    let value = "";
    try {
      const c = decryptJson<Credentials>(r.credentials);
      value = c.publisherId ?? c.websiteId ?? c.campaignId ?? "";
    } catch { /* unreadable credentials: still listed by its label */ }
    return { id: r.id, network: r.network, own: r.client_id === null, value, ref: r.account_ref };
  });
}

export default async function ClientPage({ params, searchParams }: PageProps<"/clients/[slug]">) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  const [client, stores, allPages, coupons] = await Promise.all([getClient(slug), listStores(), listPages(), listAllCoupons()]);
  if (!client || !canSeeClient(user, client.id)) notFound();
  const accounts = await usableAccounts(client.id);
  const awinIds = [...new Map(accounts.filter((a) => a.network === "awin" && a.value).map((a) => [a.value, a])).values()];
  const others = accounts.filter((a) => a.network !== "awin");
  const editable = canEdit(user);
  const now = new Date();
  const pages = allPages.filter((p) => p.client_id === client.id);
  const available = stores.filter((s) => !pages.some((p) => p.store_id === s.id));
  const perStore = new Map<number, number>();
  for (const c of coupons) if (!c.archived) perStore.set(c.store_id, (perStore.get(c.store_id) ?? 0) + 1);

  return (
    <div className="flex flex-col gap-6">
      {sp.created && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-green-200 bg-green-50 px-5 py-4 dark:border-green-900 dark:bg-green-950">
          <div>
            <strong className="text-green-900 dark:text-green-200">{client.name} creado</strong>
            <p className="text-sm text-green-800 dark:text-green-300">Su demo ya está lista en <span className="font-mono">/demo/{client.slug}</span>. Añádele tiendas abajo.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <a href={`/demo/${client.slug}`} target="_blank" className="flex min-h-11 items-center rounded-md bg-green-700 px-4 font-semibold text-white">Abrir demo ↗</a>
            <Link href="/clients" className="flex min-h-11 items-center rounded-md border border-green-300 bg-white px-4 text-green-900 dark:border-green-700 dark:bg-green-900 dark:text-green-100">Ver lista de clientes</Link>
            <Link href="/clients/new" className="flex min-h-11 items-center px-2 text-green-900 underline dark:text-green-200">Crear otro</Link>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Link href="/clients" className="text-sm text-neutral-500 hover:underline">← Clientes</Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ClientMark name={client.name} logoUrl={client.logo_url} color={client.brand_color} size="lg" />
            <div>
              <h1 className="text-2xl font-semibold">{client.name}</h1>
              <p className="text-sm text-neutral-500">{client.domain}</p>
            </div>
          </div>
          <a href={`/demo/${client.slug}`} target="_blank" className={btnCls}>Abrir su demo ↗</a>
        </div>
      </div>

      <section aria-labelledby="stores-h" className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <h2 id="stores-h" className="font-semibold">Sus tiendas · {pages.length}</h2>
          {editable && available.length > 0 && (
            <AddStoreButton client={client.slug} stores={available.map((s) => ({ slug: s.slug, name: s.name, coupons: perStore.get(s.id) ?? 0, hasLogo: s.has_logo }))} />
          )}
        </div>
        <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {pages.map((p) => (
            <li key={p.store_id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 text-sm">
              <span className="w-40 font-medium">{p.store_name}</span>
              <CoverageBadge coverage={coverageOf(p, now)} />
              <span className="text-neutral-500">{DELIVERY_LABEL[p.delivery]}</span>
              <span className="ml-auto flex gap-4">
                <Link href={`/pages/${client.slug}/${p.store_slug}?desde=cliente`} className="text-blue-700 hover:underline dark:text-blue-300">Generador</Link>
                <a href={`/p/${client.slug}/${p.store_slug}`} target="_blank" className="text-blue-700 hover:underline dark:text-blue-300">Ver página ↗</a>
                {editable && <RemovePageButton client={{ slug: client.slug, name: client.name }} store={{ slug: p.store_slug, name: p.store_name }} published={p.status === "published"} />}
              </span>
            </li>
          ))}
          {pages.length === 0 && <li className="px-5 py-6 text-sm text-neutral-500">Todavía no tiene tiendas. Añade la primera arriba.</li>}
        </ul>
      </section>

      {/* side column: affiliate data + the style form; main column: the live preview of the demo */}
      {editable && (
        <StyleForm
          key={[client.name, client.logo_url.length, client.brand_color, client.layout, client.font_family, client.font_style, client.nav_items].join("|")}
          slug={client.slug}
          domain={client.domain}
          initial={{ name: client.name, logo: client.logo_url, color: client.brand_color, layout: client.layout, ff: client.font_family, font: client.font_style, nav: client.nav_items }}
          aside={
            <section className={cardCls}>
              <h2 className="mb-1 font-semibold">Datos de afiliación</h2>
              <p className="mb-4 text-sm text-neutral-500">Elige con qué cuenta de cada red se trackean sus clics: una suya o una nuestra.</p>
              <form action={updateClient} className="flex flex-col gap-3">
                <input type="hidden" name="slug" value={client.slug} />
                <Field label="Dominio" name="domain" defaultValue={client.domain} />
                {/* the chosen account's publisher id becomes awinaffid; "" = our account that imported each coupon */}
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-neutral-600 dark:text-neutral-400">Cuenta de Awin</span>
                  <select name="awin_affiliate_id" defaultValue={client.awin_affiliate_id} className={inputCls}>
                    <option value="">{awinIds.some((a) => a.own) ? "Automática: nuestra cuenta que importó cada cupón" : "Sin cuenta: enlaces sin tracking"}</option>
                    {awinIds.some((a) => !a.own) && (
                      <optgroup label={`Cuentas de ${client.name}`}>
                        {awinIds.filter((a) => !a.own).map((a) => <option key={a.value} value={a.value}>{a.ref}</option>)}
                      </optgroup>
                    )}
                    {awinIds.some((a) => a.own) && (
                      <optgroup label="Nuestras cuentas">
                        {awinIds.filter((a) => a.own).map((a) => <option key={a.value} value={a.value}>{a.ref}</option>)}
                      </optgroup>
                    )}
                    {client.awin_affiliate_id && !awinIds.some((a) => a.value === client.awin_affiliate_id) && (
                      <option value={client.awin_affiliate_id}>Otro ID: {client.awin_affiliate_id}</option>
                    )}
                  </select>
                </label>
                <Field label="Otro Awin affiliate ID (opcional)" name="awin_affiliate_id_other" inputMode="numeric" placeholder="Solo si no está en la lista" autoComplete="off" />
                <Field label="Prefijo clickref" name="clickref_prefix" defaultValue={client.clickref_prefix} />
                <button className={`${btnSecondaryCls} min-h-10 self-start`}>Guardar</button>
              </form>
              {others.length > 0 && (
                <div className="mt-5 border-t border-neutral-200 pt-4 text-sm dark:border-neutral-800">
                  <h3 className="mb-2 font-medium">Otras redes conectadas</h3>
                  <ul className="flex flex-col gap-1">
                    {others.map((a) => (
                      <li key={a.id} className="flex flex-wrap gap-x-2">
                        <span>{adapterFor(a.network)?.label ?? a.network}</span>
                        <span className="font-mono text-xs text-neutral-500">{a.ref}</span>
                        <span className="text-neutral-500">· {a.own ? "nuestra" : "suya"}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs text-neutral-500">Sus enlaces usan el enlace de seguimiento de cada tienda.</p>
                </div>
              )}
              <Link href="/networks" className="mt-3 inline-block text-sm text-blue-700 hover:underline dark:text-blue-300">
                ¿{client.name} tiene sus propias cuentas? Conéctalas en Conectar redes →
              </Link>
            </section>
          }
        />
      )}
    </div>
  );
}
