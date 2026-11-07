// Which coupons a network sync retires because they left the feed. Pure, so the safety rules test without a database.

export interface FeedCoupon { id: number; external_id: string }

// A run that returns nothing (an API hiccup, a paused account) or would drop most of what's live is more likely a broken
// feed than a real clear-out: it archives nothing and says why
export const MIN_SHARE_KEPT = 0.5;
const SMALL = 10; // below this many live coupons, any number may go

export type ArchivePlan = { archive: number[] } | { skip: string };

export function archivePlan(live: readonly FeedCoupon[], received: ReadonlySet<string>, offersReceived: number): ArchivePlan {
  if (offersReceived === 0) return { skip: "la red no devolvió ofertas" };
  const gone = live.filter((c) => !received.has(c.external_id));
  if (live.length > SMALL && gone.length > live.length * (1 - MIN_SHARE_KEPT)) {
    return { skip: `faltarían ${gone.length} de ${live.length} cupones, demasiados para una sola sincronización` };
  }
  return { archive: gone.map((c) => c.id) };
}
