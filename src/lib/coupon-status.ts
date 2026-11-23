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

// A coupon found on the web (by the panel's search or added by hand as such) that nobody has checked yet
export const isUncheckedFind = (c: { source?: string; verified: number }) => c.source === "web" && !c.verified;

// How long an unchecked find stays on an open store (see open-stores.ts) without anyone verifying it, and when readers
// sink it before that: a net score this low, or this many «Marcar como caducado»
export const OPEN_FIND_DAYS = 14;
export const OPEN_FIND_MIN_SCORE = -2;
export const OPEN_FIND_MAX_REPORTS = 2;

type FindFields = { source?: string; verified: number; store_open?: boolean; created_at?: Date | string; score?: number; expiry_reports?: number };

// An unchecked find shown because its store is open: for OPEN_FIND_DAYS from the day it came in, while readers don't sink it
export function openFindShown(c: FindFields, todayStr: string): boolean {
  if (!c.store_open) return false;
  if ((c.score ?? 0) <= OPEN_FIND_MIN_SCORE || (c.expiry_reports ?? 0) >= OPEN_FIND_MAX_REPORTS) return false;
  if (!c.created_at) return true;
  const came = new Date(c.created_at);
  if (Number.isNaN(came.getTime())) return false;
  return daysUntil(todayStr, came.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" })) < OPEN_FIND_DAYS;
}

type PublicFields = StatusFields & FindFields & { review?: string };

// What readers see on clients' pages: never archived or expired coupons, nor codes found on the web
// that nobody has checked yet (they may be fake)
// (unless the admin turned on "publish unverified" while demoing the product, or opened that store to them)
export const isPublic = (c: PublicFields, todayStr: string, publishUnverified = false) =>
  ["ok", "pending"].includes(statusOf(c, todayStr)) && (c.review ?? "") === "" && (publishUnverified || !isUncheckedFind(c) || openFindShown(c, todayStr));

// Whether /go may redirect to and count a click on this coupon: any existing one (clients' exported pages may still link
// archived or expired ones), never one under review, never an unchecked web find (but on an open store)
export const canRedirect = (c: PublicFields, todayStr: string, publishUnverified = false) =>
  (c.review ?? "") === "" && (publishUnverified || !isUncheckedFind(c) || !!c.store_open);
