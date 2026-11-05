import { discountBadge } from "../discount.ts";
import { getJson, isoDay, required, siteOf, type Credentials, type NetAdvertiser, type NetOffer, type NetworkAdapter } from "./types.ts";

// Webgains Smart Platform API — docs.webgains.dev: Bearer personal access token,
// GET /merchants/programs (joined = membership status 10), /publishers/{p}/campaigns/{c}/vouchers and /offers
const API = "https://platform-api.webgains.com";
const PAGE = 50;
const MAX_PAGES = 100;
const LIVE = 10;

interface Program { id: number; name: string; homepage_url?: string }
interface Voucher { id: number; description: string; discount: string; destination: string | null; program: { id: number; name: string }; code: string; expiry_date: number }
interface Offer { id: number; title: string; description: string; destination: string; program: { id: number; name: string }; expiry_date: number }

export const trackingTemplate = (campaignId: string, programId: string | number) =>
  `https://track.webgains.com/click.html?wgcampaignid=${campaignId}&wgprogramid=${programId}&clickref={ref}&wgtarget={url}`;

const day = (unixSeconds: number) => (unixSeconds ? isoDay(unixSeconds * 1000) : "");

export function mapVoucher(v: Voucher): NetOffer {
  const code = v.code.trim();
  return {
    id: `v${v.id}`, // vouchers and offers are numbered separately
    advertiserId: String(v.program.id),
    kind: code ? "code" : "deal",
    title: (v.discount || v.description).trim(),
    code,
    discount: discountBadge(v.discount),
    description: v.discount ? v.description.trim() : "",
    url: v.destination ?? "",
    expires: day(v.expiry_date),
  };
}

export function mapOffer(o: Offer): NetOffer {
  return {
    id: `o${o.id}`,
    advertiserId: String(o.program.id),
    kind: "deal",
    title: o.title.trim(),
    code: "",
    discount: discountBadge(o.title),
    description: o.description.trim(),
    url: o.destination,
    expires: day(o.expiry_date),
  };
}

// The API reports last_page; follow it rather than guessing from page length (the size may be capped)
async function pages<T>(url: string, headers: Record<string, string>): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = await getJson<{ data: T[]; pagination?: { last_page: number } }>(`${url}${url.includes("?") ? "&" : "?"}page=${page}&size=${PAGE}`, { headers });
    out.push(...r.data);
    if (!r.pagination || page >= r.pagination.last_page) break;
  }
  return out;
}

export const webgains: NetworkAdapter = {
  id: "webgains",
  label: "Webgains",
  fields: [
    { name: "publisherId", label: "Publisher ID", secret: false, numeric: true, placeholder: "p. ej. 123456" },
    { name: "campaignId", label: "Campaign ID (tu sitio)", secret: false, numeric: true, placeholder: "p. ej. 1234567", help: "En Webgains cada sitio es una «campaign»: es el wgcampaignid de los enlaces" },
    { name: "token", label: "Personal access token", secret: true },
  ],
  docs: "https://docs.webgains.dev/",
  where: "platform.webgains.io → Account → User Management → tu usuario → Personal Access Token",
  ref: (c) => `Campaign ${c.campaignId}`,
  async fetchFeed(c: Credentials) {
    required(c, "publisherId", "campaignId", "token");
    if (!/^\d+$/.test(c.publisherId) || !/^\d+$/.test(c.campaignId)) throw new Error("Publisher ID y Campaign ID de Webgains son números");
    const headers = { Authorization: `Bearer ${c.token}`, Accept: "application/json" };
    const today = new Date().toISOString().slice(0, 10);
    const base = `${API}/publishers/${c.publisherId}/campaigns/${c.campaignId}`;
    const programs = await pages<Program>(`${API}/merchants/programs?campaign_id=${c.campaignId}&filters[membership_statuses][]=${LIVE}`, headers);
    const vouchers = await pages<Voucher>(`${base}/vouchers?filters[expiry_date_start]=${today}`, headers);
    const offers = await pages<Offer>(`${base}/offers?filters[expiry_date_start]=${today}`, headers);
    const advertisers = new Map<string, NetAdvertiser>(
      programs.map((p) => [String(p.id), { id: String(p.id), name: p.name.trim(), website: siteOf(p.homepage_url), trackingTemplate: trackingTemplate(c.campaignId, p.id) }]),
    );
    for (const { program, destination } of [...vouchers, ...offers]) {
      const id = String(program.id);
      if (!advertisers.has(id)) advertisers.set(id, { id, name: program.name.trim(), website: siteOf(destination), trackingTemplate: trackingTemplate(c.campaignId, id) });
    }
    return { advertisers: [...advertisers.values()], offers: [...vouchers.map(mapVoucher), ...offers.map(mapOffer)] };
  },
};
