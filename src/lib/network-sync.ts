import { sql } from "./db";
import { logActivity } from "./activity";
import { slugify } from "./form.ts";
import { decryptJson } from "./secrets.ts";
import { adapterFor } from "./networks/index.ts";
import { cleanAdvertiserName, matchStore, type StoreRef } from "./networks/match.ts";
import { isMissingCountry } from "./country-column.ts";
import { archiveMissing } from "./sync-archive";
import { recordSuccess } from "./sync-success";
import { httpsImage, networkCountries, type Credentials, type NetAdvertiser, type NetFeed, type NetOffer, type NetworkAdapter } from "./networks/types.ts";

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
  archived?: number; // live coupons that left the feed (see archiveMissing)
}

// Pull one account's advertisers and offers and fold them into stores and coupons.
// Goal is coverage: an advertiser with live offers and no store gets one; existing stores are only
// tied to the network when nothing else tracks them. Coupons are upserted by "<network>:<offer id>".
export async function syncAccount(account: NetworkAccount): Promise<SyncSummary> {
  const adapter = adapterFor(account.network);
  if (!adapter) throw new Error(`Red sin integración: ${account.network}`);
  return syncCredentials(adapter, decryptJson<Credentials>(account.credentials), account.client_id);
}

// Also how a new account is checked before it's saved: a feed that comes back is credentials that work
export async function syncCredentials(adapter: NetworkAdapter, creds: Credentials, clientId: number | null): Promise<SyncSummary> {
  const feed = await adapter.fetchFeed(creds);
  // Awin links are built from merchant id + publisher id: remember which of our publisher ids can track each
  // coupon and store, so clients without an affiliate id of their own still get tracked links
  const publisherId = adapter.id === "awin" && clientId === null ? (creds.publisherId ?? "") : "";
  return mergeFeed(adapter, feed, clientId, publisherId);
}

async function mergeFeed(adapter: NetworkAdapter, feed: NetFeed, clientId: number | null, publisherId: string): Promise<SyncSummary> {
  const net = adapter.id;
  const ownAccount = clientId === null;
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

  if (clientId !== null) await saveClientTracking(clientId, net, feed.advertisers, storeOf);
  await saveNetworkCountries(networkCountries(feed.advertisers, storeOf));
  if (publisherId && storeOf.size) {
    // first of our publisher ids joined to the advertiser keeps the store; manual coupons there use it
    await sql()`UPDATE stores SET publisher_id = ${publisherId} WHERE id = ANY(${[...new Set(storeOf.values())]}::int[]) AND publisher_id = ''`;
  }
  const { created, updated } = await upsertCoupons(net, feed.offers, storeOf, publisherId);
  const archived = await archiveMissing(net, feed.offers, [...new Set(storeOf.values())], publisherId, ownAccount);
  return { ...summary, created, updated, archived };
}

// A client's own account: keep its link per store so that client's clicks go through its account, not ours
async function saveClientTracking(clientId: number, net: string, advertisers: NetAdvertiser[], storeOf: Map<string, number>) {
  const rows = [...new Map(advertisers.flatMap((a) => {
    const store_id = storeOf.get(a.id);
    return store_id && a.trackingTemplate ? [[store_id, { client_id: clientId, store_id, network: net, tracking_url: a.trackingTemplate }] as const] : [];
  })).values()];
  await sql()`DELETE FROM client_tracking WHERE client_id = ${clientId} AND network = ${net}`;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await sql()`INSERT INTO client_tracking ${sql()(rows.slice(i, i + CHUNK))} ON CONFLICT (client_id, store_id) DO UPDATE SET network = excluded.network, tracking_url = excluded.tracking_url`;
  }
}

// The country a network gives for its programme becomes the store's (country_source 'network'), unless an editor set it
// by hand. Skipped until npm run db:setup adds the columns.
async function saveNetworkCountries(countries: Map<number, string>) {
  if (!countries.size) return;
  const ids = [...countries.keys()];
  const codes = ids.map((id) => countries.get(id) ?? "");
  try {
    await sql()`
      UPDATE stores s SET country = v.country, country_source = 'network'
      FROM (SELECT unnest(${ids}::int[]) AS id, unnest(${codes}::text[]) AS country) v
      WHERE s.id = v.id AND s.country_source <> 'manual' AND (s.country <> v.country OR s.country_source <> 'network')`;
  } catch (e) {
    if (!isMissingCountry(e)) throw e;
  }
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

// New offers come in verified (the network vouches for them); re-syncs refresh the text, code, dates and product image
// but leave archived/verified as the team set them.
async function upsertCoupons(net: string, offers: NetOffer[], storeOf: Map<string, number>, publisherId: string) {
  // one row per offer: Postgres refuses to upsert the same key twice in one statement (pages can overlap)
  const unique = [...new Map(offers.map((o) => [o.id, o])).values()];
  const rows = unique.flatMap((o) => {
    const store_id = storeOf.get(o.advertiserId);
    if (!store_id || !o.title) return [];
    return [{
      store_id, kind: o.kind, title: o.title.slice(0, 300), code: o.code, discount: o.discount,
      description: o.description.slice(0, 2000), target_url: o.url, expires_at: o.expires,
      verified: 1, source: net, external_id: `${net}:${o.id}`, publisher_id: publisherId,
      image_url: httpsImage(o.image),
    }];
  });
  let created = 0;
  let updated = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const res = await sql()<{ inserted: boolean }[]>`
      INSERT INTO coupons ${sql()(rows.slice(i, i + CHUNK))}
      ON CONFLICT (external_id) DO UPDATE SET
        kind = excluded.kind, title = excluded.title, code = excluded.code, discount = excluded.discount,
        description = excluded.description, target_url = excluded.target_url, expires_at = excluded.expires_at,
        -- a feed without a photo keeps the one read from the landing page (fill-product-images), unless the landing changed
        image_url = CASE WHEN excluded.image_url <> '' THEN excluded.image_url
          WHEN excluded.target_url <> coupons.target_url THEN '' ELSE coupons.image_url END,
        image_checked_at = CASE WHEN excluded.target_url <> coupons.target_url THEN NULL ELSE coupons.image_checked_at END,
        -- a client's own account sends "": it never takes over the publisher id our account set
        publisher_id = CASE WHEN excluded.publisher_id <> '' THEN excluded.publisher_id ELSE coupons.publisher_id END
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
    s.archived ? `${s.archived} retirados del feed` : "",
  ].filter(Boolean).join(" · ");

export async function recordSync(account: NetworkAccount, result: { summary?: SyncSummary; error?: string }) {
  const text = result.summary ? describeSync(result.summary) : "";
  await sql()`
    UPDATE network_accounts SET last_sync_at = now(), last_result = ${text}, last_error = ${result.error ?? ""}
    WHERE id = ${account.id}`;
  if (!result.error) await recordSuccess(account.id);
  await logActivity(result.error ? `Error sincronizando ${account.network}: ${result.error}` : `Sincronizado ${account.network}: ${text}`);
}

// A client's Awin id is whatever Conectar redes assigns it: the publisher id of its first own Awin account
// ("Publisher 12345" in account_ref), or "" so each coupon falls back to our account that imported it.
// Run after any change to network_accounts.
export async function syncClientAwinIds() {
  await sql()`
    UPDATE clients c SET awin_affiliate_id = coalesce((
      SELECT regexp_replace(a.account_ref, '^Publisher ', '') FROM network_accounts a
      WHERE a.network = 'awin' AND a.client_id = c.id ORDER BY a.id LIMIT 1), '')`;
}
