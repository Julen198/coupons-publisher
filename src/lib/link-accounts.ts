import { sql, type Client } from "./db";
import type { LinkAccounts } from "./tracked-link.ts";

// What trackedLinkOf needs to know about whose link it builds: the client (its slug starts the clickref, its own Awin
// id wins), that client's own accounts' links per store (client_tracking), and the publisher ids of our Awin accounts.

// The client whose clicks the public site counts as (create it in Clientes with this slug)
export const SITE_CLIENT_SLUG = process.env.SITE_CLIENT_SLUG || "cuponlab";

export interface ClientLinks {
  client: Pick<Client, "id" | "slug" | "awin_affiliate_id">;
  templates: ReadonlyMap<number, { network: string; tracking_url: string }>; // store id → the client's own link
  awinPublishers: ReadonlySet<string>;
}

// network_accounts.account_ref is "Publisher 12345" for Awin
export const awinPublisherOf = (accountRef: string): string => accountRef.replace(/^Publisher\s+/i, "").trim();

export async function ourAwinPublishers(): Promise<Set<string>> {
  const rows = await sql()<{ account_ref: string }[]>`SELECT account_ref FROM network_accounts WHERE network = 'awin' AND client_id IS NULL`;
  return new Set(rows.map((r) => awinPublisherOf(r.account_ref)).filter(Boolean));
}

export async function clientLinks(client: ClientLinks["client"]): Promise<ClientLinks> {
  const [rows, awinPublishers] = await Promise.all([
    client.id > 0
      ? sql()<{ store_id: number; network: string; tracking_url: string }[]>`SELECT store_id, network, tracking_url FROM client_tracking WHERE client_id = ${client.id}`
      : Promise.resolve([]),
    ourAwinPublishers(),
  ]);
  return { client, templates: new Map(rows.map((r) => [r.store_id, { network: r.network, tracking_url: r.tracking_url }])), awinPublishers };
}

// The public site's: the cuponlab client, or a stand-in with its slug while that client doesn't exist
export async function siteLinks(): Promise<ClientLinks> {
  const [row] = await sql()<Pick<Client, "id" | "slug" | "awin_affiliate_id">[]>`SELECT id, slug, awin_affiliate_id FROM clients WHERE slug = ${SITE_CLIENT_SLUG}`;
  return clientLinks(row ? { ...row } : { id: 0, slug: SITE_CLIENT_SLUG, awin_affiliate_id: "" });
}

// The accounts for one store's links: the client's own link only counts in the store's current network
export function accountsFor(links: ClientLinks, store: { id: number; network: string }): LinkAccounts {
  const own = links.templates.get(store.id);
  return { client: links.client, clientTemplate: own && own.network === store.network ? own.tracking_url : "", awinPublishers: links.awinPublishers };
}
