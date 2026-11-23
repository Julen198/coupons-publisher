import { sql } from "./db";
import { logActivity } from "./activity";
import { today } from "./coupon-status.ts";
import { archivePlan, type FeedCoupon } from "./sync-archive-plan.ts";
import type { NetOffer } from "./networks/types.ts";
import { openUnverifiedColumn } from "./open-stores.ts";

// After a sync of one of OUR accounts: live coupons of that network, in the stores this account feeds (and for Awin,
// imported with its publisher id), that didn't come back in this run are archived. Manual coupons and web finds have
// another source and are never touched; expired ones stay as they are (their pages say so). A client's own account
// archives nothing: our account for the same network is what keeps those coupons. archivePlan's safety: a run with 0
// offers, or one that would drop most of them, archives nothing. Returns how many were archived.
export async function archiveMissing(net: string, offers: readonly NetOffer[], storeIds: readonly number[], publisherId: string, ownAccount: boolean): Promise<number> {
  if (!ownAccount || !storeIds.length) return 0;
  const awinScope = net === "awin" ? sql()`AND publisher_id = ${publisherId}` : sql()``;
  const live = await sql()<FeedCoupon[]>`
    SELECT id, external_id FROM coupons
    WHERE source = ${net} AND archived = 0 AND external_id LIKE ${`${net}:%`} AND store_id = ANY(${[...storeIds]}::int[])
      AND (expires_at = '' OR expires_at >= ${today()}) ${awinScope}`;
  const plan = archivePlan(live, new Set(offers.map((o) => `${net}:${o.id}`)), offers.length);
  if ("skip" in plan) {
    if (live.length) await logActivity(`Sincronización de ${net}: no se archiva nada, ${plan.skip}`);
    return 0;
  }
  if (!plan.archive.length) return 0;
  await sql()`UPDATE coupons SET archived = 1 WHERE id = ANY(${plan.archive}::int[]) AND archived = 0`;
  return plan.archive.length;
}

// After any sync: stores opened to unchecked web finds (see open-stores.ts) that now have live coupons of an affiliate
// network keep only those. Their unchecked web finds are retired (archived, so an editor can still see them); the ones
// someone verified stay. Returns how many. Nothing happens until the column exists.
export async function archiveOpenFinds(storeIds: readonly number[]): Promise<number> {
  if (!storeIds.length) return 0;
  return openUnverifiedColumn.run(async (present) => {
    if (!present) return 0;
    const rows = await sql()<{ id: number }[]>`
      UPDATE coupons w SET archived = 1
      FROM stores s
      WHERE s.id = w.store_id AND s.open_unverified AND w.store_id = ANY(${[...storeIds]}::int[])
        AND w.source = 'web' AND w.verified = 0 AND w.archived = 0
        AND EXISTS (
          SELECT 1 FROM coupons n WHERE n.store_id = w.store_id AND n.archived = 0 AND n.source NOT IN ('manual', 'web')
            AND (n.expires_at = '' OR n.expires_at >= ${today()}))
      RETURNING w.id`;
    return rows.length;
  });
}
