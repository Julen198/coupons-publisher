import { io } from "next/cache";
import { sql } from "./db";

export interface ClickRow { id: number; name: string; slug: string; clicks: number }
export interface CouponClickRow { id: number; title: string; code: string; store_name: string; clicks: number }

export interface ClickStats {
  total: number;
  previous: number; // same-length period right before, for the trend
  byDay: { day: string; clicks: number }[]; // every day in range, zero-filled
  byClient: ClickRow[];
  byStore: ClickRow[];
  topCoupons: CouponClickRow[];
}

export const DEFAULT_RETENTION = "365";

export async function clickRetention(): Promise<string> {
  await io();
  const [row] = await sql()<{ value: string }[]>`SELECT value FROM settings WHERE key = 'click_retention_days'`;
  return row?.value ?? DEFAULT_RETENTION;
}

// ponytail: purges lazily when stats are read instead of a nightly cron; add a Vercel cron if traffic makes this slow
async function purgeOldClicks() {
  const keep = await clickRetention();
  if (keep !== "all") await sql()`DELETE FROM clicks WHERE at < now() - ${Number(keep)} * interval '1 day'`;
}

// Click stats for the last `days` full days + today, optionally for one client.
// `allowed` = client ids the viewer may see (null = all). Days are Madrid calendar days.
export async function clickStats(days: number, clientId?: number, allowed: number[] | null = null): Promise<ClickStats> {
  await io();
  await purgeOldClicks();
  const s = sql();
  const since = s`date_trunc('day', now() AT TIME ZONE 'Europe/Madrid') - ${days - 1} * interval '1 day'`;
  const forClient = clientId
    ? s`AND k.client_id = ${clientId}`
    : allowed
      ? s`AND k.client_id = ANY(${allowed.length ? allowed : [0]}::int[])`
      : s``;
  const inRange = s`(k.at AT TIME ZONE 'Europe/Madrid') >= ${since} ${forClient}`;

  const [totals, byDay, byClient, byStore, topCoupons] = await Promise.all([
    s<{ total: string; previous: string }[]>`
      SELECT count(*) FILTER (WHERE (k.at AT TIME ZONE 'Europe/Madrid') >= ${since}) AS total,
             count(*) FILTER (WHERE (k.at AT TIME ZONE 'Europe/Madrid') < ${since}
                              AND (k.at AT TIME ZONE 'Europe/Madrid') >= ${since} - ${days} * interval '1 day') AS previous
      FROM clicks k WHERE true ${forClient}`,
    s<{ day: string; clicks: string }[]>`
      SELECT to_char(d, 'YYYY-MM-DD') AS day, count(k.id) AS clicks
      FROM generate_series(${since}, date_trunc('day', now() AT TIME ZONE 'Europe/Madrid'), interval '1 day') AS d
      LEFT JOIN clicks k ON date_trunc('day', k.at AT TIME ZONE 'Europe/Madrid') = d ${forClient}
      GROUP BY d ORDER BY d`,
    s<ClickRow[]>`
      SELECT c.id, c.name, c.slug, count(*)::int AS clicks FROM clicks k JOIN clients c ON c.id = k.client_id
      WHERE ${inRange} GROUP BY c.id ORDER BY clicks DESC`,
    s<ClickRow[]>`
      SELECT st.id, st.name, st.slug, count(*)::int AS clicks FROM clicks k JOIN stores st ON st.id = k.store_id
      WHERE ${inRange} GROUP BY st.id ORDER BY clicks DESC`,
    s<CouponClickRow[]>`
      SELECT cp.id, cp.title, cp.code, st.name AS store_name, count(*)::int AS clicks
      FROM clicks k JOIN coupons cp ON cp.id = k.coupon_id JOIN stores st ON st.id = k.store_id
      WHERE ${inRange} GROUP BY cp.id, st.name ORDER BY clicks DESC LIMIT 8`,
  ]);

  const plain = <T,>(rows: readonly T[]) => rows.map((r) => ({ ...r }));
  return {
    total: Number(totals[0]?.total ?? 0),
    previous: Number(totals[0]?.previous ?? 0),
    byDay: byDay.map((r) => ({ day: r.day, clicks: Number(r.clicks) })),
    byClient: plain(byClient),
    byStore: plain(byStore),
    topCoupons: plain(topCoupons),
  };
}
