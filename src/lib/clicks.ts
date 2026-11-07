import { io } from "next/cache";
import { sql } from "./db";
import { clickColumns } from "./tracking-columns.ts";
import { CLICK_RETENTION_DAYS, DEDUPE_SECONDS, retentionDays, type ClickKind } from "./click-signals.ts";

export interface ClickRow { id: number; name: string; slug: string; clicks: number }
export interface CouponClickRow { id: number; title: string; code: string; store_name: string; clicks: number }

export interface ClickStats {
  total: number; // clicks out to a store (go + untracked); copies are counted apart
  previous: number; // same-length period right before, for the trend
  byKind: Record<ClickKind, number>; // in the period: through a tracked link, "Copiar código", straight to the store untracked
  byDay: { day: string; clicks: number }[]; // every day in range, zero-filled
  byClient: ClickRow[];
  byStore: ClickRow[];
  topCoupons: CouponClickRow[];
}

export const DEFAULT_RETENTION = String(CLICK_RETENTION_DAYS);

export async function clickRetention(): Promise<string> {
  await io();
  const [row] = await sql()<{ value: string }[]>`SELECT value FROM settings WHERE key = 'click_retention_days'`;
  return row?.value ?? DEFAULT_RETENTION;
}

// The retention cron (/api/clicks/cron): deletes clicks older than the window (never under 400 days, see retentionDays).
// Reading stats never deletes. Returns how many went.
export async function purgeOldClicks(): Promise<number> {
  const [row] = await sql()<{ value: string }[]>`SELECT value FROM settings WHERE key = 'click_retention_days'`;
  const keep = retentionDays(row?.value);
  if (keep === null) return 0;
  const res = await sql()`DELETE FROM clicks WHERE at < now() - ${keep} * interval '1 day'`;
  return res.count;
}

export interface ClickEvent { clientId: number; storeId: number; couponId: number; kind: ClickKind; ref: string; uaHash: string }

// One click row, unless the same browser (ua hash) already counted this coupon and kind in the last DEDUPE_SECONDS.
// Until the migration adds kind/ref/ua_hash, the old row (who, which store and coupon) without dedupe; copies and
// untracked clicks are not recorded then (they would read as tracked clicks).
export async function recordClick(e: ClickEvent): Promise<"recorded" | "duplicate" | "skipped"> {
  return clickColumns.run(async (present) => {
    if (!present) {
      if (e.kind !== "go") return "skipped";
      await sql()`INSERT INTO clicks (client_id, store_id, coupon_id) VALUES (${e.clientId}, ${e.storeId}, ${e.couponId})`;
      return "recorded";
    }
    const rows = await sql()`
      INSERT INTO clicks (client_id, store_id, coupon_id, kind, ref, ua_hash)
      SELECT ${e.clientId}::int, ${e.storeId}::int, ${e.couponId}::int, ${e.kind}::text, ${e.ref}::text, ${e.uaHash}::text
      WHERE NOT EXISTS (
        SELECT 1 FROM clicks WHERE coupon_id = ${e.couponId}::int AND ua_hash = ${e.uaHash}::text AND kind = ${e.kind}::text
          AND at > now() - ${DEDUPE_SECONDS} * interval '1 second')
      RETURNING id`;
    return rows.length ? "recorded" : "duplicate";
  });
}

// Click stats for the last `days` full days + today, optionally for one client.
// `allowed` = client ids the viewer may see (null = all). Days are Madrid calendar days.
export async function clickStats(days: number, clientId?: number, allowed: number[] | null = null): Promise<ClickStats> {
  await io();
  return clickColumns.run((present) => statsQuery(present, days, clientId, allowed));
}

async function statsQuery(present: boolean, days: number, clientId: number | undefined, allowed: number[] | null): Promise<ClickStats> {
  const s = sql();
  const since = s`date_trunc('day', now() AT TIME ZONE 'Europe/Madrid') - ${days - 1} * interval '1 day'`;
  const forClient = clientId
    ? s`AND k.client_id = ${clientId}`
    : allowed
      ? s`AND k.client_id = ANY(${allowed.length ? allowed : [0]}::int[])`
      : s``;
  // clicks out to a store: copies are their own count
  const out = present ? s`AND k.kind <> 'copy'` : s``;
  const inRange = s`(k.at AT TIME ZONE 'Europe/Madrid') >= ${since} ${forClient} ${out}`;

  const [totals, kinds, byDay, byClient, byStore, topCoupons] = await Promise.all([
    s<{ total: string; previous: string }[]>`
      SELECT count(*) FILTER (WHERE (k.at AT TIME ZONE 'Europe/Madrid') >= ${since}) AS total,
             count(*) FILTER (WHERE (k.at AT TIME ZONE 'Europe/Madrid') < ${since}
                              AND (k.at AT TIME ZONE 'Europe/Madrid') >= ${since} - ${days} * interval '1 day') AS previous
      FROM clicks k WHERE true ${forClient} ${out}`,
    present
      ? s<{ kind: ClickKind; n: string }[]>`
          SELECT k.kind, count(*) AS n FROM clicks k WHERE (k.at AT TIME ZONE 'Europe/Madrid') >= ${since} ${forClient} GROUP BY k.kind`
      : Promise.resolve([]),
    s<{ day: string; clicks: string }[]>`
      SELECT to_char(d, 'YYYY-MM-DD') AS day, count(k.id) AS clicks
      FROM generate_series(${since}, date_trunc('day', now() AT TIME ZONE 'Europe/Madrid'), interval '1 day') AS d
      LEFT JOIN clicks k ON date_trunc('day', k.at AT TIME ZONE 'Europe/Madrid') = d ${forClient} ${out}
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
  const total = Number(totals[0]?.total ?? 0);
  const kind = (k: ClickKind) => Number(kinds.find((r) => r.kind === k)?.n ?? 0);
  return {
    total,
    previous: Number(totals[0]?.previous ?? 0),
    byKind: present ? { go: kind("go"), copy: kind("copy"), untracked: kind("untracked") } : { go: total, copy: 0, untracked: 0 },
    byDay: byDay.map((r) => ({ day: r.day, clicks: Number(r.clicks) })),
    byClient: plain(byClient),
    byStore: plain(byStore),
    topCoupons: plain(topCoupons),
  };
}
