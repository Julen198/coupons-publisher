// Network commissions from Awin's transactions API, stored per transaction so the stats can say how much each store,
// client and origin earned. Only transactions whose clickref is ours are kept (see commissions-parse.ts): the Awin
// accounts are shared with Runnea and its sales are never stored.
import { sql } from "./db";
import { decryptJson } from "./secrets.ts";
import { awinPublisherOf } from "./link-accounts";
import { bearer } from "./networks/awin.ts";
import { getJson, type Credentials } from "./networks/types.ts";
import { awinWindows, parseAwinTransactions, type CommissionRow } from "./commissions-parse.ts";

const API = "https://api.awin.com";
// Commissions move from pending to approved or declined for weeks after the sale: re-read this far back each run
const LOOKBACK_DAYS = 90;

export interface CommissionSync { accounts: number; ours: number; errors: string[] }

async function upsert(rows: CommissionRow[]) {
  for (const r of rows) {
    await sql()`
      INSERT INTO commissions (id, network, publisher_id, merchant_id, store_id, client_slug, coupon_id, source, clickref, amount, currency, sale_amount, status, at)
      VALUES (${r.id}, ${r.network}, ${r.publisherId}, ${r.merchantId},
        (SELECT id FROM stores WHERE network = 'awin' AND merchant_id = ${r.merchantId} LIMIT 1),
        ${r.client}, ${r.couponId}, ${r.source}, ${r.clickref}, ${r.amount}, ${r.currency}, ${r.saleAmount}, ${r.status}, ${r.at}::timestamp AT TIME ZONE 'Europe/Madrid')
      ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, amount = EXCLUDED.amount, sale_amount = EXCLUDED.sale_amount,
        store_id = coalesce(commissions.store_id, EXCLUDED.store_id), synced_at = now()`;
  }
}

// Every Awin account connected in Redes de afiliación, last LOOKBACK_DAYS days. One failing account doesn't stop the rest.
export async function syncCommissions(): Promise<CommissionSync> {
  const [accounts, clients] = await Promise.all([
    sql()<{ id: number; account_ref: string; credentials: string }[]>`SELECT id, account_ref, credentials FROM network_accounts WHERE network = 'awin'`,
    sql()<{ slug: string }[]>`SELECT slug FROM clients`,
  ]);
  const slugs = clients.map((c) => c.slug);
  const out: CommissionSync = { accounts: 0, ours: 0, errors: [] };
  for (const a of accounts) {
    try {
      const creds = decryptJson<Credentials>(a.credentials);
      const publisherId = (creds.publisherId || awinPublisherOf(a.account_ref)).trim();
      if (!/^\d+$/.test(publisherId) || !creds.token) throw new Error("faltan el token o el Publisher ID");
      for (const w of awinWindows(LOOKBACK_DAYS)) {
        const q = new URLSearchParams({ startDate: w.start, endDate: w.end, timezone: "Europe/Madrid", dateType: "transaction" });
        const body = await getJson<unknown>(`${API}/publishers/${publisherId}/transactions/?${q}`, { headers: { Authorization: bearer(creds.token) } });
        const rows = parseAwinTransactions(body, publisherId, slugs);
        await upsert(rows);
        out.ours += rows.length;
      }
      out.accounts++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("awin commissions sync failed", a.account_ref, msg);
      out.errors.push(`${a.account_ref}: ${msg}`.slice(0, 200));
    }
  }
  return out;
}

export interface CommissionTotals { earned: number; approved: number; sales: number; byStore: Map<number, number>; bySource: Map<string, number> }

// Commissions of sales made between two Madrid days: pending + approved count as earned (declined and deleted don't)
export async function commissionsBetween(start: string, end: string): Promise<CommissionTotals> {
  const empty: CommissionTotals = { earned: 0, approved: 0, sales: 0, byStore: new Map(), bySource: new Map() };
  try {
    const rows = await sql()<{ store_id: number | null; source: string; status: string; amount: number }[]>`
      SELECT store_id, source, status, amount::float AS amount FROM commissions
      WHERE status IN ('pending', 'approved') AND (at AT TIME ZONE 'Europe/Madrid')::date BETWEEN ${start}::date AND ${end}::date`;
    return rows.reduce((t, r) => {
      t.earned += r.amount;
      if (r.status === "approved") t.approved += r.amount;
      t.sales++;
      if (r.store_id) t.byStore.set(r.store_id, (t.byStore.get(r.store_id) ?? 0) + r.amount);
      t.bySource.set(r.source, (t.bySource.get(r.source) ?? 0) + r.amount);
      return t;
    }, empty);
  } catch (e) {
    console.error("commissions read failed", e); // before db:setup: stats show no commissions instead of failing
    return empty;
  }
}
