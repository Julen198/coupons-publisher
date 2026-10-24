import { discountBadge } from "./discount.ts";

// Sanity rules for coupons a model found on the web: they arrive unverified and must look like real data.

export interface FoundCoupon { title: string; code: string; discount: string; description: string; expires: string; sourceUrl: string }
export interface CouponDraft {
  kind: "code" | "deal"; title: string; code: string; discount: string; description: string; expires_at: string; source_url: string;
}

export const MAX_FOUND_PER_STORE = 8;
const CODE = /^[A-Z0-9][A-Z0-9_-]{2,29}$/;

export function cleanFoundCoupons(raw: FoundCoupon[], todayStr: string, existing: { title: string; code: string }[]): CouponDraft[] {
  const seen = new Set(existing.map((e) => `${e.title.trim().toLowerCase()}|${e.code.toUpperCase()}`));
  const out: CouponDraft[] = [];
  for (const r of raw) {
    const title = r.title.trim().slice(0, 120);
    const code = r.code.trim().toUpperCase();
    const expires = /^\d{4}-\d{2}-\d{2}$/.test(r.expires.trim()) ? r.expires.trim() : "";
    if (title.length < 3 || (expires && expires < todayStr)) continue;
    const draft: CouponDraft = {
      kind: CODE.test(code) ? "code" : "deal",
      title,
      code: CODE.test(code) ? code : "",
      discount: discountBadge(r.discount),
      description: r.description.trim().slice(0, 240),
      expires_at: expires,
      source_url: URL.canParse(r.sourceUrl) && /^https?:$/.test(new URL(r.sourceUrl).protocol) ? r.sourceUrl : "",
    };
    const key = `${title.toLowerCase()}|${draft.code}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(draft);
    if (out.length === MAX_FOUND_PER_STORE) break;
  }
  return out;
}
