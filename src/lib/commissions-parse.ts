// Network commissions, the pure part: reading Awin's transactions and telling ours from everyone else's. The Awin
// accounts are shared (Runnea's publisher ids), so a transaction only counts when its clickref starts with one of our
// clients' slugs (clickrefFor: "<client>-<store>-<coupon>[-<source>]"). The queries are in commissions.ts.

export interface CommissionRow {
  id: string; network: "awin"; publisherId: string; merchantId: string;
  client: string; couponId: number | null; source: string; clickref: string;
  amount: number; currency: string; saleAmount: number; status: string; at: string;
}

const SOURCE = /^[a-z][a-z0-9]{0,15}$/;

// "cuponlab-aosom-1322-tienda" → client cuponlab, coupon 1322, source tienda. null when it isn't one of our clients'.
export function parseClickref(ref: string, clients: readonly string[]): { client: string; couponId: number | null; source: string } | null {
  const client = [...clients].sort((a, b) => b.length - a.length).find((c) => ref.startsWith(`${c}-`));
  if (!client) return null;
  const m = /(?:^|-)(\d+)(?:-([a-z][a-z0-9]*))?$/.exec(ref.slice(client.length + 1));
  return { client, couponId: m ? Number(m[1]) : null, source: m?.[2] ?? "" };
}

type Money = { amount?: number | string; currency?: string } | undefined;
type AwinTx = {
  id?: number | string; advertiserId?: number | string; commissionStatus?: string; status?: string;
  commissionAmount?: Money; saleAmount?: Money; transactionDate?: string;
  clickRefs?: { clickRef?: string; clickRef2?: string }; clickRef?: string; clickRef2?: string;
};

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// GET /publishers/{id}/transactions/ → our rows. Accepts clickRefs as an object or as top-level fields.
export function parseAwinTransactions(body: unknown, publisherId: string, clients: readonly string[]): CommissionRow[] {
  if (!Array.isArray(body)) return [];
  return (body as AwinTx[]).flatMap((t) => {
    const clickref = (t.clickRefs?.clickRef ?? t.clickRef ?? "").trim();
    const ours = clickref ? parseClickref(clickref, clients) : null;
    if (!ours || t.id == null) return [];
    const ref2 = (t.clickRefs?.clickRef2 ?? t.clickRef2 ?? "").trim().toLowerCase();
    return [{
      id: `awin:${t.id}`, network: "awin" as const, publisherId, merchantId: String(t.advertiserId ?? ""),
      client: ours.client, couponId: ours.couponId, source: SOURCE.test(ref2) ? ref2 : ours.source, clickref,
      amount: num(t.commissionAmount?.amount), currency: t.commissionAmount?.currency ?? "EUR", saleAmount: num(t.saleAmount?.amount),
      status: (t.commissionStatus ?? t.status ?? "").toLowerCase(), at: t.transactionDate ?? "",
    }];
  });
}

const madridDay = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
const shift = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// The last `days` days up to today (Madrid) in windows of at most 31 days: Awin refuses longer ranges
export function awinWindows(days: number, now = new Date()): { start: string; end: string }[] {
  const today = madridDay(now);
  const out: { start: string; end: string }[] = [];
  for (let from = shift(today, -(days - 1)); from <= today; from = shift(from, 31)) {
    const to = shift(from, 30) < today ? shift(from, 30) : today;
    out.push({ start: `${from}T00:00:00`, end: `${to}T23:59:59` });
  }
  return out;
}
