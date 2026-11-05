import { discountBadge } from "../discount.ts";
import { getJson, getText, isoDay, required, siteOf, type Credentials, type NetAdvertiser, type NetOffer, type NetworkAdapter } from "./types.ts";
import { decodeXml, elements, text } from "./xml.ts";

// Rakuten Advertising publisher APIs — developers.rakutenadvertising.com:
// POST /token (Bearer base64(client_id:client_secret), scope = SID) → access token;
// GET /coupon/1.0 (XML, partnered advertisers only) and /v2/advertisers (JSON, for the shops' websites)
const API = "https://api.linksynergy.com";
const PAGE = 500;
const MAX_PAGES = 50;

export interface RakutenCoupon {
  advertiserId: string;
  advertiserName: string;
  description: string;
  code: string;
  restriction: string;
  endDate: string;
  clickUrl: string;
  types: string[];
}

export function parseCoupons(xml: string): { coupons: RakutenCoupon[]; pages: number } {
  const coupons = elements(xml, "link").map((l) => ({
    advertiserId: text(l, "advertiserid"),
    advertiserName: text(l, "advertisername"),
    description: text(l, "offerdescription"),
    code: text(l, "couponcode"),
    restriction: text(l, "couponrestriction"),
    endDate: text(l, "offerenddate"),
    clickUrl: text(l, "clickurl"),
    types: elements(l, "promotiontype").map(decodeXml),
  }));
  return { coupons, pages: Number(text(xml, "TotalPages")) || 1 };
}

// The coupon's click link carries our encrypted publisher id: reuse it for deep links to any page of the shop
export function trackingTemplate(clickUrl: string, mid: string): string {
  if (!URL.canParse(clickUrl)) return "";
  const id = new URL(clickUrl).searchParams.get("id");
  return id ? `https://click.linksynergy.com/deeplink?id=${encodeURIComponent(id)}&mid=${mid}&u1={ref}&murl={url}` : "";
}

// No offer id in the feed: the click link's offerid identifies it
const offerId = (c: RakutenCoupon) =>
  (URL.canParse(c.clickUrl) ? new URL(c.clickUrl).searchParams.get("offerid") : null) ?? `${c.advertiserId}-${c.code || c.description}`.slice(0, 120);

export function mapCoupon(c: RakutenCoupon, website: string): NetOffer {
  const code = c.code.trim();
  const freeShipping = c.types.some((t) => /free shipping|envío gratis/i.test(t));
  return {
    id: offerId(c),
    advertiserId: c.advertiserId,
    kind: code ? "code" : "deal",
    title: c.description,
    code,
    discount: discountBadge(c.description) || (freeShipping ? "Envío gratis" : ""),
    description: c.restriction,
    url: website,
    expires: isoDay(c.endDate),
  };
}

async function token(c: Credentials): Promise<string> {
  const r = await getJson<{ access_token: string }>(`${API}/token`, {
    method: "POST",
    headers: { Authorization: `Bearer ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ scope: c.sid }),
  });
  return r.access_token;
}

interface Advertiser { id: number; name: string; url?: string }

export const rakuten: NetworkAdapter = {
  id: "rakuten",
  label: "Rakuten",
  fields: [
    { name: "sid", label: "Site ID (SID)", secret: false, numeric: true, placeholder: "p. ej. 3912345", help: "Una cuenta por SID: si tienes varios sitios, conecta cada uno" },
    { name: "clientId", label: "Client ID", secret: false },
    { name: "clientSecret", label: "Client secret", secret: true },
  ],
  docs: "https://developers.rakutenadvertising.com/guides/try_it_out",
  where: "Rakuten Advertising → Links → Web Services (Client ID, Client secret y SID)",
  ref: (c) => `SID ${c.sid}`,
  async fetchFeed(c: Credentials) {
    required(c, "sid", "clientId", "clientSecret");
    if (!/^\d+$/.test(c.sid)) throw new Error("El SID de Rakuten es un número");
    const headers = { Authorization: `Bearer ${await token(c)}` };
    const coupons: RakutenCoupon[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const r = parseCoupons(await getText(`${API}/coupon/1.0?resultsperpage=${PAGE}&pagenumber=${page}`, { headers }));
      coupons.push(...r.coupons);
      if (page >= r.pages || r.coupons.length < PAGE) break;
    }
    // websites of the partnered shops; the coupon feed has none. Optional: a missing scope must not stop the sync
    const sites = new Map<string, string>();
    try {
      for (let page = 1; page <= MAX_PAGES; page++) {
        const r = await getJson<{ advertisers?: Advertiser[]; _metadata?: { _links?: { next?: unknown } } }>(`${API}/v2/advertisers?page=${page}`, { headers });
        for (const a of r.advertisers ?? []) sites.set(String(a.id), siteOf(a.url));
        if (!r._metadata?._links?.next || !r.advertisers?.length) break;
      }
    } catch (e) {
      console.warn("rakuten advertisers", e);
    }
    const advertisers = new Map<string, NetAdvertiser>();
    for (const cp of coupons) {
      const known = advertisers.get(cp.advertiserId);
      const tpl = trackingTemplate(cp.clickUrl, cp.advertiserId);
      if (known) advertisers.set(cp.advertiserId, { ...known, trackingTemplate: known.trackingTemplate || tpl });
      else advertisers.set(cp.advertiserId, { id: cp.advertiserId, name: cp.advertiserName, website: sites.get(cp.advertiserId) ?? "", trackingTemplate: tpl });
    }
    return {
      advertisers: [...advertisers.values()],
      offers: coupons.filter((cp) => cp.advertiserId && cp.description).map((cp) => mapCoupon(cp, sites.get(cp.advertiserId) ?? "")),
    };
  },
};
