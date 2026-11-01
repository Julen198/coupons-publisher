import { sql } from "./db";
import { logActivity } from "./activity";
import { slugify } from "./form.ts";
import { decryptJson } from "./secrets.ts";
import { adapterFor } from "./networks/index.ts";
import { cleanAdvertiserName, matchStore, type StoreRef } from "./networks/match.ts";
import type { Credentials, NetAdvertiser, NetFeed, NetOffer, NetworkAdapter } from "./networks/types.ts";

export interface NetworkAccount {
  id: number;
  network: string;
  client_id: number | null;
  account_ref: string;
  credentials: string;
}

export interface SyncSummary {
  created: number; // new coupons
  updated: number; // coupons refreshed from the network
  newStores: string[]; // slugs, for the icon lookup
  linkedStores: number; // existing stores tied to their advertiser
  otherNetwork: number; // advertisers whose shop already goes through another network
}

// Pull one account's advertisers and offers and fold them into stores and coupons.
// Goal is coverage: an advertiser with live offers and no store gets one; existing stores are only
// tied to the network when nothing else tracks them. Coupons are upserted by "<network>:<offer id>".
export async function syncAccount(account: NetworkAccount): Promise<SyncSummary> {
  const adapter = adapterFor(account.network);
  if (!adapter) throw new Error(`Red sin integración: ${account.network}`);
  const feed = await adapter.fetchFeed(decryptJson<Credentials>(account.credentials));
  const summary = await mergeFeed(adapter, feed, account.client_id === null);
  if (account.network === "awin" && account.client_id !== null) {
    // a client's own Awin account: their links should carry their publisher id
    const { publisherId } = decryptJson<Credentials>(account.credentials);
    await sql()`UPDATE clients SET awin_affiliate_id = ${publisherId} WHERE id = ${account.client_id} AND awin_affiliate_id = ''`;
  }
  return summary;
}

async function mergeFeed(adapter: NetworkAdapter, feed: NetFeed, ownAccount: boolean): Promise<SyncSummary> {
  const net = adapter.id;
  let stores: StoreRef[] = [...(await sql()<StoreRef[]>`SELECT id, slug, website, network, merchant_id, tracking_url FROM stores`)];
  const withOffers = new Set(feed.offers.map((o) => o.advertiserId));
  const storeOf = new Map<string, number>(); // advertiser id → store id (only stores that go through this network)
  const summary: SyncSummary = { created: 0, updated: 0, newStores: [], linkedStores: 0, otherNetwork: 0 };

  for (const adv of feed.advertisers) {
    const m = matchStore(net, adv, stores);
    if (m.kind === "linked") {
      storeOf.set(adv.id, m.store.id);
      // a client's account has its own site id in the template: never overwrite ours with it
      if (adv.trackingTemplate && (ownAccount || !m.store.tracking_url) && m.store.tracking_url !== adv.trackingTemplate) {
        await sql()`UPDATE stores SET tracking_url = ${adv.trackingTemplate} WHERE id = ${m.store.id}`;
      }
    } else if (m.kind === "claim") {
      await sql()`
        UPDATE stores SET network = ${net}, merchant_id = ${adv.id},
          tracking_url = ${adv.trackingTemplate || m.store.tracking_url}
        WHERE id = ${m.store.id}`;
      stores = stores.map((st) => (st.id === m.store.id ? { ...st, network: net, merchant_id: adv.id } : st));
      storeOf.set(adv.id, m.store.id);
      summary.linkedStores++;
    } else if (m.kind === "other-network") {
      summary.otherNetwork++;
    } else if (withOffers.has(adv.id) && adv.website) {
      const created = await createStore(net, adv);
      if (created) {
        stores = [...stores, created];
        storeOf.set(adv.id, created.id);
        summary.newStores.push(created.slug);
      }
    }
  }

  const { created, updated } = await upsertCoupons(net, feed.offers, storeOf);
  return { ...summary, created, updated };
}

async function createStore(net: string, adv: NetAdvertiser): Promise<StoreRef | undefined> {
  const name = cleanAdvertiserName(adv.name);
  const base = slugify(name);
  if (!base) return undefined;
  for (const slug of [base, `${base}-${net}`]) {
    const [row] = await sql()<StoreRef[]>`
      INSERT INTO stores (name, slug, website, network, merchant_id, tracking_url)
      VALUES (${name}, ${slug}, ${adv.website}, ${net}, ${adv.id}, ${adv.trackingTemplate})
      ON CONFLICT (slug) DO NOTHING
      RETURNING id, slug, website, network, merchant_id, tracking_url`;
    if (row) return { ...row };
  }
  return undefined;
}

const CHUNK = 500;

// New offers come in verified (the network vouches for them); re-syncs refresh the text, code and dates
// but leave archived/verified as the team set them.
async function upsertCoupons(net: string, offers: NetOffer[], storeOf: Map<string, number>) {
  // one row per offer: Postgres refuses to upsert the same key twice in one statement (pages can overlap)
  const unique = [...new Map(offers.map((o) => [o.id, o])).values()];
  const rows = unique.flatMap((o) => {
    const store_id = storeOf.get(o.advertiserId);
    if (!store_id || !o.title) return [];
    return [{
      store_id, kind: o.kind, title: o.title.slice(0, 300), code: o.code, discount: o.discount,
      description: o.description.slice(0, 2000), target_url: o.url, expires_at: o.expires,
      verified: 1, source: net, external_id: `${net}:${o.id}`,
    }];
  });
  let created = 0;
  let updated = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const res = await sql()<{ inserted: boolean }[]>`
      INSERT INTO coupons ${sql()(rows.slice(i, i + CHUNK))}
      ON CONFLICT (external_id) DO UPDATE SET
        kind = excluded.kind, title = excluded.title, code = excluded.code, discount = excluded.discount,
        description = excluded.description, target_url = excluded.target_url, expires_at = excluded.expires_at
      RETURNING (xmax = 0) AS inserted`;
    const fresh = res.filter((r) => r.inserted).length;
    created += fresh;
    updated += res.length - fresh;
  }
  return { created, updated };
}

export const describeSync = (s: SyncSummary) =>
  [
    `${s.created} cupones nuevos`,
    `${s.updated} actualizados`,
    s.newStores.length ? `${s.newStores.length} tiendas nuevas` : "",
    s.linkedStores ? `${s.linkedStores} tiendas vinculadas` : "",
    s.otherNetwork ? `${s.otherNetwork} anunciantes ya en otra red` : "",
  ].filter(Boolean).join(" · ");

export async function recordSync(account: NetworkAccount, result: { summary?: SyncSummary; error?: string }) {
  const text = result.summary ? describeSync(result.summary) : "";
  await sql()`
    UPDATE network_accounts SET last_sync_at = now(), last_result = ${text}, last_error = ${result.error ?? ""}
    WHERE id = ${account.id}`;
  await logActivity(result.error ? `Error sincronizando ${account.network}: ${result.error}` : `Sincronizado ${account.network}: ${text}`);
}
