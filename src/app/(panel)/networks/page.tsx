import { redirect } from "next/navigation";
import { canEdit, requireUser } from "@/lib/auth";
import { listClients, listStores, sql, type Coupon } from "@/lib/db";
import { ADAPTERS, adapterFor } from "@/lib/networks/index";
import { decryptJson } from "@/lib/secrets";
import type { Credentials } from "@/lib/networks/types";
import { cardCls, fmtDateTime, PageHeader } from "@/app/ui";
import { LinkFormats, type LinkExample } from "./link-formats";
import { AccountDialog, DeleteAccountButton, SyncButton, type AccountDefaults, type NetworkOption } from "./network-ui";

interface AccountRow {
  id: number;
  network: string;
  client_id: number | null;
  account_ref: string;
  credentials: string;
  last_sync_at: Date | null;
  last_result: string;
  last_error: string;
}

// Only the non-secret fields go back to the browser, to prefill the edit dialog
function publicValues(row: AccountRow): Record<string, string> {
  const adapter = adapterFor(row.network);
  try {
    const creds = decryptJson<Credentials>(row.credentials);
    return Object.fromEntries((adapter?.fields ?? []).filter((f) => !f.secret).map((f) => [f.name, creds[f.name] ?? ""]));
  } catch {
    return {};
  }
}

export default async function NetworksPage() {
  const user = await requireUser();
  if (!canEdit(user)) redirect("/");
  const admin = user.role === "admin";
  const [accounts, clients, stores, coupons, allStores, sampleCoupons] = await Promise.all([
    sql()<AccountRow[]>`SELECT * FROM network_accounts ORDER BY network, client_id NULLS FIRST`,
    listClients(),
    sql()<{ network: string; n: number }[]>`SELECT network, count(*)::int AS n FROM stores WHERE merchant_id <> '' GROUP BY network`,
    sql()<{ source: string; n: number }[]>`SELECT source, count(*)::int AS n FROM coupons WHERE archived = 0 GROUP BY source`,
    listStores(),
    // one live coupon per network, from a store that is tied to its advertiser, for the example links
    sql()<(Pick<Coupon, "id" | "target_url" | "title" | "store_id"> & { network: string })[]>`
      SELECT DISTINCT ON (s.network) c.id, c.target_url, c.title, c.store_id, s.network
      FROM coupons c JOIN stores s ON s.id = c.store_id
      WHERE c.archived = 0 AND s.merchant_id <> ''
      ORDER BY s.network, c.verified DESC, c.id DESC`,
  ]);
  const examples: LinkExample[] = sampleCoupons.flatMap(({ network, store_id, ...coupon }) => {
    const store = allStores.find((st) => st.id === store_id);
    return store ? [{ network, store, coupon }] : [];
  });
  // our own accounts' non-secret ids (Awin publisher, Admitad ad space, Webgains campaign)
  const ourIds = Object.fromEntries(
    accounts.filter((a) => a.client_id === null).map((a) => {
      const v = publicValues(a);
      return [a.network, v.campaignId ?? v.websiteId ?? v.publisherId ?? ""];
    }),
  );
  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  const storesBy = new Map(stores.map((r) => [r.network, r.n]));
  const couponsBy = new Map(coupons.map((r) => [r.source, r.n]));
  const networks: NetworkOption[] = ADAPTERS.map((a) => ({ id: a.id, label: a.label, where: a.where, fields: a.fields }));
  const clientOpts = clients.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Integraciones" title="Redes de afiliación">
        {accounts.length > 0 && <SyncButton label="Sincronizar todas" primary />}
        {admin && <AccountDialog networks={networks} clients={clientOpts} trigger="Conectar una red" />}
      </PageHeader>

      <p className="max-w-3xl text-sm text-neutral-600 dark:text-neutral-400">
        Cada sincronización lee los anunciantes a los que estás unido y todos sus cupones y ofertas vigentes. Los anunciantes con
        ofertas que aún no tienen tienda se crean solos; las tiendas que ya existían se vinculan si no van por otra red. Los cupones
        entran como verificados y se actualizan en cada sincronización.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ADAPTERS.map((a) => {
          const own = accounts.filter((acc) => acc.network === a.id);
          return (
            <section key={a.id} aria-labelledby={`net-${a.id}`} className={`${cardCls} flex flex-col gap-1`}>
              <h2 id={`net-${a.id}`} className="flex items-center gap-2 font-semibold">
                <span className={`size-2.5 rounded-full ${own.length ? "bg-green-600" : "bg-neutral-300 dark:bg-neutral-600"}`} aria-hidden="true" />
                {a.label}
              </h2>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                {own.length ? `${own.length} cuenta${own.length > 1 ? "s" : ""}` : "Sin conectar"}
              </p>
              <p className="text-sm">
                {storesBy.get(a.id) ?? 0} tiendas · {couponsBy.get(a.id) ?? 0} cupones
              </p>
            </section>
          );
        })}
      </div>

      <section aria-labelledby="accounts" className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
        <h2 id="accounts" className="border-b border-neutral-200 bg-neutral-50 px-5 py-3 font-semibold dark:border-neutral-800 dark:bg-neutral-900">Cuentas conectadas</h2>
        {accounts.length === 0 ? (
          <p className="px-5 py-6 text-sm text-neutral-600 dark:text-neutral-400">
            {admin ? "Conecta la primera red con «Conectar una red»." : "Un administrador tiene que conectar las redes."}
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {accounts.map((acc) => {
              const label = adapterFor(acc.network)?.label ?? acc.network;
              const owner = acc.client_id === null ? "Nuestra cuenta" : (clientName.get(acc.client_id) ?? "Cliente eliminado");
              const defaults: AccountDefaults = { network: acc.network, owner: acc.client_id === null ? "" : String(acc.client_id), values: publicValues(acc) };
              return (
                <li key={acc.id} className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
                  <div className="flex min-w-0 flex-col gap-0.5 text-sm">
                    <span className="font-semibold">{label} <span className="font-normal text-neutral-500">· {owner}</span></span>
                    <span className="font-mono text-xs text-neutral-500">{acc.account_ref}</span>
                    <span className="text-xs text-neutral-600 dark:text-neutral-400">
                      {acc.last_sync_at ? `Última sincronización ${fmtDateTime(acc.last_sync_at)}` : "Nunca sincronizada"}
                      {acc.last_result && !acc.last_error ? ` · ${acc.last_result}` : ""}
                    </span>
                    {acc.last_error && <span role="alert" className="text-xs text-red-700 dark:text-red-300">{acc.last_error}</span>}
                  </div>
                  <div className="flex flex-wrap items-start gap-2">
                    <SyncButton id={acc.id} />
                    {admin && <AccountDialog networks={networks} clients={clientOpts} defaults={defaults} trigger="Editar" />}
                    {admin && <DeleteAccountButton id={acc.id} label={`${label} · ${owner}`} />}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <LinkFormats clients={clients} examples={examples} ourIds={ourIds} />
    </div>
  );
}
