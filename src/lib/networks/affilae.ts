import { discountBadge } from "../discount.ts";
import { getJson, isoDay, REGION, required, siteOf, type Credentials, type NetAdvertiser, type NetOffer, type NetworkAdapter } from "./types.ts";

// Affilae publisher API — rest.affilae.com/reference: Bearer token. GET /publisher/publishers.me (our affiliate
// profiles), /publisher/partnerships.list (approved programmes), /publisher/vouchers.list (codes) and
// /publisher/ads.list?type=coupon (the coupon text and landing page, joined to the codes by programme).
const API = "https://rest.affilae.com";
const PAGE = 100;
const MAX_PAGES = 50;

interface Partnership { id: string; trackingId?: number | string; urlType?: string; program?: { id: string; name?: string; url?: string; countries?: string[] } }
export interface Voucher { id: string; program: string; name?: string; code: string; activeTo?: string; isBlacklisted?: boolean }
interface CouponAd { program: string; content?: string; url?: string }

// Parameter partnerships track on the shop's own page: ae = our tracking id, aev = sub-id (affilae.com, SubIDs).
// Redirect/S2S ones need their url.build call per link: left for a hand-pasted link.
export function partnershipTemplate(p: Pick<Partnership, "trackingId" | "urlType">): string {
  return p.urlType === "parameter" && p.trackingId ? `{url}?ae=${p.trackingId}&aev={ref}` : "";
}

// Codes have no text of their own: the programme's coupon ad that names the code describes it
export function mapVoucher(v: Voucher, adText: string, website: string): NetOffer {
  const code = v.code.trim();
  const named = (v.name ?? "").trim();
  const title = adText.trim() || (named && named !== code ? named : `Código ${code}`);
  return {
    id: v.id,
    advertiserId: v.program,
    kind: "code",
    title,
    code,
    discount: discountBadge(title),
    description: "",
    url: website,
    expires: isoDay(v.activeTo),
  };
}

async function vouchersOf(profile: string, headers: Record<string, string>): Promise<Voucher[]> {
  const out: Voucher[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const r = await getJson<{ vouchers?: { total?: number; data?: Voucher[] } }>(
      `${API}/publisher/vouchers.list?affiliateProfile=${profile}&status=active&limit=${PAGE}&offset=${page * PAGE}`, { headers });
    const rows = r.vouchers?.data ?? [];
    out.push(...rows);
    if (rows.length < PAGE || out.length >= (r.vouchers?.total ?? 0)) break;
  }
  return out;
}

export const affilae: NetworkAdapter = {
  id: "affilae",
  label: "Affilae",
  fields: [{ name: "token", label: "Token de API", secret: true }],
  docs: "https://rest.affilae.com/reference",
  where: "app.affilae.com → API Tokens",
  ref: (c) => `Token …${c.token.slice(-4)}`,
  async fetchFeed(c: Credentials) {
    required(c, "token");
    const headers = { Authorization: `Bearer ${c.token}`, Accept: "application/json" };
    const me = await getJson<{ affiliateProfiles?: { data?: { id: string }[] } }>(`${API}/publisher/publishers.me`, { headers });
    const profiles = (me.affiliateProfiles?.data ?? []).map((p) => p.id);
    if (!profiles.length) throw new Error("Esa cuenta de Affilae no tiene ningún perfil de afiliado");
    const advertisers = new Map<string, NetAdvertiser>();
    const offers: NetOffer[] = [];
    for (const profile of profiles) {
      const { partnerships } = await getJson<{ partnerships?: { data?: Partnership[] } }>(
        `${API}/publisher/partnerships.list?affiliateProfile=${profile}&status=approved&withProgramsDetails=true`, { headers });
      for (const p of partnerships?.data ?? []) {
        const countries = p.program?.countries ?? [];
        if (!p.program || (countries.length && !countries.includes(REGION))) continue;
        advertisers.set(p.program.id, { id: p.program.id, name: (p.program.name ?? p.program.id).trim(), website: siteOf(p.program.url), trackingTemplate: partnershipTemplate(p) });
      }
      const ads = await getJson<CouponAd[]>(`${API}/publisher/ads.list?affiliateProfile=${profile}&type=coupon&status=active`, { headers });
      for (const v of await vouchersOf(profile, headers)) {
        if (v.isBlacklisted || !advertisers.has(v.program)) continue;
        const ad = (Array.isArray(ads) ? ads : []).find((a) => a.program === v.program && (a.content ?? "").toUpperCase().includes(v.code.toUpperCase()));
        offers.push(mapVoucher(v, ad?.content ?? "", ad?.url || advertisers.get(v.program)?.website || ""));
      }
    }
    return { advertisers: [...advertisers.values()], offers };
  },
};
