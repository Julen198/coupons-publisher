import { discountBadge } from "../discount.ts";
import { getJson, isoDay, required, siteOf, type Credentials, type NetAdvertiser, type NetOffer, type NetworkAdapter } from "./types.ts";

// impact.com Partner (Mediapartners) API — integrations.impact.com/impact-publisher: Basic auth Account SID + Auth Token,
// GET /Mediapartners/{SID}/Campaigns (our contracts, with the tracking link) and /Deals (promos with their default code)
const API = "https://api.impact.com/Mediapartners";
const PAGE = 1000;
const MAX_PAGES = 50;

export interface Campaign {
  CampaignId: string;
  CampaignName: string;
  CampaignUrl?: string;
  TrackingLink?: string;
  ContractStatus?: string;
  AllowDeeplinking?: string | boolean;
}

export interface Deal {
  Id: string;
  Name: string;
  Description?: string;
  CampaignId: string;
  CampaignName?: string;
  State?: string;
  Type?: string;
  DefaultPromoCode?: string;
  EndDate?: string;
  DiscountType?: string;
  DiscountAmount?: string;
  DiscountPercent?: string;
  DiscountCurrency?: string;
  Uri?: string;
}

const yes = (v: unknown) => v === true || String(v).toLowerCase() === "true";

// "https://shop.sjv.io/c/123/456/789" + subId1 (our ref) + u (the page), the deep link impact documents
export function trackingTemplate(c: Campaign): string {
  const link = (c.TrackingLink ?? "").trim().split("?")[0];
  if (!/^https:\/\//.test(link)) return "";
  return yes(c.AllowDeeplinking) ? `${link}?subId1={ref}&u={url}` : `${link}?subId1={ref}`;
}

export function mapCampaign(c: Campaign): NetAdvertiser {
  return { id: String(c.CampaignId), name: c.CampaignName.trim(), website: siteOf(c.CampaignUrl), trackingTemplate: trackingTemplate(c) };
}

const currency = (c = "") => (!c || c.toUpperCase() === "EUR" ? "€" : ` ${c.toUpperCase()}`);

export function discountOf(d: Deal): string {
  const pct = Number(d.DiscountPercent);
  if (pct > 0) return `${pct}%`;
  const amount = Number(d.DiscountAmount);
  if (amount > 0) return `${amount}${currency(d.DiscountCurrency)}`;
  if (/FREE_SHIPPING/i.test(d.Type ?? "") || /FREE_SHIPPING/i.test(d.DiscountType ?? "")) return "Envío gratis";
  return discountBadge(d.Name) || discountBadge(d.Description ?? "");
}

export function mapDeal(d: Deal, website = ""): NetOffer | null {
  if (d.State && !/^(ACTIVE|PENDING)$/i.test(d.State)) return null; // expired / paused deals
  const code = (d.DefaultPromoCode ?? "").trim();
  return {
    id: String(d.Id),
    advertiserId: String(d.CampaignId),
    kind: code ? "code" : "deal",
    title: d.Name.trim(),
    code,
    discount: discountOf(d),
    description: (d.Description ?? "").trim(),
    url: website,
    expires: isoDay(d.EndDate),
  };
}

// impact pages with @page / @numpages; the list sits under the resource's own name
async function pages<T>(url: string, key: string, headers: Record<string, string>): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = await getJson<Record<string, unknown>>(`${url}${url.includes("?") ? "&" : "?"}PageSize=${PAGE}&Page=${page}`, { headers });
    out.push(...((r[key] as T[] | undefined) ?? []));
    if (page >= (Number(r["@numpages"]) || 1)) break;
  }
  return out;
}

export const impact: NetworkAdapter = {
  id: "impact",
  label: "Impact",
  fields: [
    { name: "accountSid", label: "Account SID", secret: false, placeholder: "p. ej. IRabc123…", help: "Empieza por IR; identifica tu cuenta de partner" },
    { name: "authToken", label: "Auth Token", secret: true },
  ],
  docs: "https://integrations.impact.com/impact-publisher/reference/overview",
  where: "impact.com → Settings → API (Account SID y Auth Token, con permiso de lectura)",
  ref: (c) => `Cuenta ${c.accountSid}`,
  async fetchFeed(c: Credentials) {
    required(c, "accountSid", "authToken");
    if (!/^[A-Za-z0-9]+$/.test(c.accountSid)) throw new Error("El Account SID de Impact solo lleva letras y números");
    const headers = { Authorization: `Basic ${Buffer.from(`${c.accountSid}:${c.authToken}`).toString("base64")}`, Accept: "application/json" };
    const base = `${API}/${c.accountSid}`;
    const campaigns = (await pages<Campaign>(`${base}/Campaigns`, "Campaigns", headers)).filter((cp) => !cp.ContractStatus || /active/i.test(cp.ContractStatus));
    const deals = await pages<Deal>(`${base}/Deals`, "Deals", headers);
    const advertisers = new Map(campaigns.map((cp) => [String(cp.CampaignId), mapCampaign(cp)]));
    return {
      advertisers: [...advertisers.values()],
      // a deal only tracks through its campaign's link: campaigns we have no contract with are dropped
      offers: deals
        .filter((d) => advertisers.has(String(d.CampaignId)))
        .map((d) => mapDeal(d, advertisers.get(String(d.CampaignId))?.website))
        .filter((o): o is NetOffer => o !== null),
    };
  },
};
