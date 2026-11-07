import { discountBadge } from "../discount.ts";
import { getText, isoDay, REGION, required, singleCountry, siteOf, type Credentials, type NetAdvertiser, type NetOffer, type NetworkAdapter } from "./types.ts";
import { attr, elements, text } from "./xml.ts";

// CJ (Commission Junction) Link Search API — developers.cj.com/docs/rest-apis/link-search:
// GET link-search.api.cj.com/v2/link-search with a personal access token (Bearer), XML out.
// advertiser-ids=joined only returns links of advertisers we're approved with, so advertisers come from the links.
const API = "https://link-search.api.cj.com/v2/link-search";
const PAGE = 100; // CJ's maximum records-per-page
const MAX_PAGES = 50;
// promotion types worth a coupon page: codes, sales and free shipping
const PROMOTIONS = ["coupon", "sale/discount", "free shipping"];

export interface CjLink {
  linkId: string;
  advertiserId: string;
  advertiserName: string;
  name: string;
  description: string;
  couponCode: string;
  promotionType: string;
  endDate: string;
  destination: string;
  clickUrl: string;
  countries: string;
}

export function parseLinks(xml: string): { links: CjLink[]; total: number } {
  const links = elements(xml, "link").map((l) => ({
    linkId: text(l, "link-id"),
    advertiserId: text(l, "advertiser-id"),
    advertiserName: text(l, "advertiser-name"),
    name: text(l, "link-name"),
    description: text(l, "description"),
    couponCode: text(l, "coupon-code"),
    promotionType: text(l, "promotion-type"),
    endDate: text(l, "promotion-end-date"),
    destination: text(l, "destination"),
    clickUrl: text(l, "clickUrl"),
    countries: text(l, "targeted-countries"),
  }));
  return { links, total: Number(attr(xml, "links", "total-matched")) || 0 };
}

// "https://www.anrdoezrs.net/click-123-456" → that click link with our sid and the deep link target
export function trackingTemplate(clickUrl: string): string {
  const base = clickUrl.trim().split("?")[0];
  return /^https:\/\/[^/]+\/click-\d+-\d+$/.test(base.replace(/^http:/, "https:"))
    ? `${base.replace(/^http:/, "https:")}?sid={ref}&url={url}`
    : "";
}

export function mapLink(l: CjLink): NetOffer | null {
  const countries = l.countries.split(/[,\s]+/).filter(Boolean).map((c) => c.toUpperCase());
  if (countries.length && !countries.includes(REGION)) return null;
  const code = l.couponCode.trim();
  return {
    id: l.linkId,
    advertiserId: l.advertiserId,
    kind: code ? "code" : "deal",
    title: l.name || l.description,
    code,
    discount: l.promotionType === "free shipping" ? "Envío gratis" : discountBadge(l.name) || discountBadge(l.description),
    description: l.name ? l.description : "",
    url: siteOf(l.destination) ? l.destination : "",
    expires: isoDay(l.endDate),
  };
}

// An advertiser whose every link targets the same single country sells there; a link with no targeted countries
// (everywhere) or links for several countries say nothing
export function advertiserCountry(links: readonly Pick<CjLink, "countries">[]): string {
  const lists = links.map((l) => l.countries.split(/[,\s]+/).filter(Boolean));
  if (!lists.length || lists.some((c) => !c.length)) return "";
  return singleCountry(lists.flat());
}

export const cj: NetworkAdapter = {
  id: "cj",
  label: "CJ",
  fields: [
    { name: "websiteId", label: "ID del sitio web (PID)", secret: false, numeric: true, placeholder: "p. ej. 9876543", help: "El PID de tu propiedad/sitio, no el CID de la empresa" },
    { name: "token", label: "Personal access token", secret: true },
  ],
  docs: "https://developers.cj.com/docs/rest-apis/link-search",
  where: "CJ → Account → Properties (el PID), y developers.cj.com → Authentication → Personal Access Tokens",
  ref: (c) => `Sitio ${c.websiteId}`,
  async fetchFeed(c: Credentials) {
    required(c, "websiteId", "token");
    if (!/^\d+$/.test(c.websiteId)) throw new Error("El ID del sitio web (PID) de CJ es un número");
    const headers = { Authorization: `Bearer ${c.token}` };
    const links: CjLink[] = [];
    for (const type of PROMOTIONS) {
      for (let page = 1; page <= MAX_PAGES; page++) {
        const q = new URLSearchParams({ "website-id": c.websiteId, "advertiser-ids": "joined", "promotion-type": type, "records-per-page": String(PAGE), "page-number": String(page) });
        const r = parseLinks(await getText(`${API}?${q}`, { headers }));
        links.push(...r.links);
        if (r.links.length < PAGE || page * PAGE >= r.total) break;
      }
    }
    const advertisers = new Map<string, NetAdvertiser>();
    for (const l of links) {
      const known = advertisers.get(l.advertiserId);
      const a = { id: l.advertiserId, name: l.advertiserName, website: siteOf(l.destination), trackingTemplate: trackingTemplate(l.clickUrl) };
      advertisers.set(l.advertiserId, known ? { ...known, website: known.website || a.website, trackingTemplate: known.trackingTemplate || a.trackingTemplate } : a);
    }
    const country = (id: string) => advertiserCountry(links.filter((l) => l.advertiserId === id));
    const withCountry = [...advertisers.values()].map((a) => {
      const code = country(a.id);
      return code ? { ...a, country: code } : a;
    });
    return { advertisers: withCountry, offers: links.map(mapLink).filter((o): o is NetOffer => o !== null && Boolean(o.id)) };
  },
};
