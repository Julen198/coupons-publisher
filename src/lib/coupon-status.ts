export type CouponStatus = "ok" | "pending" | "expired" | "archived";
export type StatusFilter = "all" | "soon" | CouponStatus;

interface StatusFields {
  verified: number;
  archived: number;
  expires_at: string; // "YYYY-MM-DD" or ""
}

export const SOON_DAYS = 7;

// Local calendar date as "YYYY-MM-DD" (sv-SE locale formats exactly like that)
export const today = (now = new Date()) => now.toLocaleDateString("sv-SE");

export function daysUntil(date: string, todayStr: string): number {
  return Math.round((Date.parse(date) - Date.parse(todayStr)) / 86_400_000);
}

export function statusOf(c: StatusFields, todayStr: string): CouponStatus {
  if (c.archived) return "archived";
  if (c.expires_at && c.expires_at < todayStr) return "expired";
  return c.verified ? "ok" : "pending";
}

export function expiresSoon(c: StatusFields, todayStr: string): boolean {
  const s = statusOf(c, todayStr);
  return (s === "ok" || s === "pending") && !!c.expires_at && daysUntil(c.expires_at, todayStr) <= SOON_DAYS;
}

export function matchesFilter(c: StatusFields, filter: StatusFilter, todayStr: string): boolean {
  const s = statusOf(c, todayStr);
  if (filter === "all") return s !== "archived";
  if (filter === "soon") return expiresSoon(c, todayStr);
  return s === filter;
}

// What readers see on clients' pages: never archived or expired coupons, nor codes found on the web
// that nobody has checked yet (they may be fake)
// (unless the admin turned on "publish unverified" while demoing the product)
export const isPublic = (c: StatusFields & { source?: string }, todayStr: string, publishUnverified = false) =>
  ["ok", "pending"].includes(statusOf(c, todayStr)) && (publishUnverified || !(c.source === "web" && !c.verified));

// Whether /go may redirect to and count a click on this coupon: public, and never one still under review
export const canRedirect = (c: StatusFields & { source?: string; review?: string }, todayStr: string, publishUnverified = false) =>
  (c.review ?? "") === "" && isPublic(c, todayStr, publishUnverified);
