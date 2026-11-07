import { sql } from "./db";
import { logActivity } from "./activity";
import { today } from "./coupon-status.ts";
import { archivePlan, type FeedCoupon } from "./sync-archive-plan.ts";
import type { NetOffer } from "./networks/types.ts";

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
