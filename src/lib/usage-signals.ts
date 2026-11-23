// What the public site says about how much a coupon is being used. Only real counts from the clicks table (a «Ir a la
// tienda» or «Copiar código» by a reader, bots and link checkers left out, see click-signals.ts): nothing invented, nothing
// rounded up. Below a minimum the count is not shown at all, so a new coupon or store never reads «Usado 0 veces».
// Pure, so it tests without a database.
import { timeAgo } from "./community.ts";

// Uses in the last 7 days below which no count shows (a few clicks could be our own checks)
export const USES_MIN = 5;
// A last use older than this is not news: the line goes
export const LAST_USE_HOURS = 72;

// One use = one browser on one coupon on one Madrid day (clicks.ua_hash changes every day), whether it copied the code,
// went to the store or both: never more than the people who really used it
export type Usage = { uses_week: number; last_used_at: Date | string | null };

const asDate = (at: Date | string | null | undefined): Date | null => {
  if (!at) return null;
  const d = at instanceof Date ? at : new Date(at);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const usesLabel = (n: number): string => (n === 1 ? "Usado 1 vez esta semana" : `Usado ${n} veces esta semana`);

// "Usado 12 veces esta semana · último uso hace 2 h", "Usado 12 veces esta semana", "Último uso hace 2 h" or ""
export function usageLine(u: Partial<Usage>, now: Date): string {
  const n = u.uses_week ?? 0;
  const last = asDate(u.last_used_at);
  const fresh = last && now.getTime() - last.getTime() <= LAST_USE_HOURS * 3_600_000 && last.getTime() <= now.getTime() + 60_000 ? last : null;
  const parts: string[] = [];
  if (n >= USES_MIN) parts.push(usesLabel(n));
  if (fresh) parts.push(parts.length ? `último uso ${timeAgo(fresh, now)}` : `Último uso ${timeAgo(fresh, now)}`);
  return parts.join(" · ");
}

// A store page: its coupons' uses added up, "" under the minimum
export function storeUsesLabel(list: readonly Partial<Usage>[]): string {
  const n = list.reduce((sum, c) => sum + (c.uses_week ?? 0), 0);
  return n >= USES_MIN ? (n === 1 ? "1 uso esta semana" : `${n} usos esta semana`) : "";
}
