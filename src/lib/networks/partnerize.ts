import { discountBadge } from "../discount.ts";
import { getJson, isoDay, required, siteOf, type Credentials, type NetAdvertiser, type NetOffer, type NetworkAdapter } from "./types.ts";

// Partnerize partner API — api-docs.partnerize.com/partner: Basic auth (application key : user API key),
// GET /v3/partner/{id}/participations (approved campaigns, with their camref link) and, one call per campaign,
// /user/publisher/{id}/campaign/{campaign}/voucher. Vouchers have no title or landing page: the description
// (or the code) is the title and the campaign's site the page.
const API = "https://api.partnerize.com";

interface Participation {
  campaign_id?: string;
  campaign_info: { title?: string; destination_url?: string; tracking_link?: string; allow_deep_linking?: string };
}
export interface PartnerizeVoucher { voucher_code_id: string; campaign_id: string; voucher_code: string; description?: string; end_date_time?: string; active?: string }

// "https://prf.hn/click/camref:XXXX" + /pubref:<ref> + /destination:<page>, in that order
export function participationTemplate(p: Participation): string {
  const link = (p.campaign_info.tracking_link ?? "").trim().split("?")[0].replace(/\/$/, "");
  if (!/^https:\/\//.test(link)) return "";
  return p.campaign_info.allow_deep_linking === "y" ? `${link}/pubref:{ref}/destination:{url}` : `${link}/pubref:{ref}`;
}

export function mapPartnerizeVoucher(v: PartnerizeVoucher, website: string): NetOffer | null {
  const code = v.voucher_code.trim();
  if (v.active === "n" || !code) return null;
  const title = (v.description ?? "").trim() || `Código ${code}`;
  return {
    id: v.voucher_code_id,
    advertiserId: v.campaign_id,
    kind: "code",
    title,
    code,
    discount: discountBadge(title),
    description: "",
    url: website,
    expires: isoDay(v.end_date_time),
  };
}

export const partnerize: NetworkAdapter = {
  id: "partnerize",
  label: "Partnerize",
  fields: [
    { name: "publisherId", label: "Partner (publisher) ID", secret: false, placeholder: "p. ej. 1l1007802" },
    { name: "appKey", label: "User Application Key", secret: true },
    { name: "apiKey", label: "User API Key", secret: true },
  ],
  docs: "https://api-docs.partnerize.com/partner/",
  where: "console.partnerize.com → Settings → Account settings",
  ref: (c) => `Partner ${c.publisherId}`,
  async fetchFeed(c: Credentials) {
    required(c, "publisherId", "appKey", "apiKey");
    if (!/^[a-z0-9]+$/i.test(c.publisherId)) throw new Error("El Partner ID de Partnerize solo lleva letras y números");
    const headers = { Authorization: `Basic ${Buffer.from(`${c.appKey}:${c.apiKey}`).toString("base64")}`, Accept: "application/json" };
    const { data = [] } = await getJson<{ data?: Participation[] }>(`${API}/v3/partner/${c.publisherId}/participations`, { headers });
    const advertisers = data.flatMap((p): NetAdvertiser[] => {
      const id = String(p.campaign_id ?? "");
      return id ? [{ id, name: (p.campaign_info.title ?? id).trim(), website: siteOf(p.campaign_info.destination_url), trackingTemplate: participationTemplate(p) }] : [];
    });
    const offers: NetOffer[] = [];
    // ponytail: one call per campaign, in turn (Partnerize has no account-wide voucher list); parallelise if it gets slow
    for (const a of advertisers) {
      const r = await getJson<{ voucher_codes?: { voucher_code: PartnerizeVoucher }[] }>(`${API}/user/publisher/${c.publisherId}/campaign/${a.id}/voucher`, { headers });
      offers.push(...(r.voucher_codes ?? []).flatMap((x) => mapPartnerizeVoucher(x.voucher_code, a.website) ?? []));
    }
    return { advertisers, offers };
  },
};
