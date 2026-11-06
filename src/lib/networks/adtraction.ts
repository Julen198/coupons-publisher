import { discountBadge } from "../discount.ts";
import { getJson, isoDay, REGION, required, siteOf, type Credentials, type NetAdvertiser, type NetOffer, type NetworkAdapter } from "./types.ts";

// Adtraction partner API — apidocs.adtraction.net/nextgen: X-Token header,
// POST /v3/partner/programs/ (approvalStatus 1 = joined, trackingURL only with our channel) and POST /v2/partner/offers/
const API = "https://api.adtraction.net";
const APPROVED = 1;

export interface Program { programId: string | number; programName: string; programURL?: string; trackingURL?: string }
export interface Offer {
  offerId: string | number;
  programId: string | number;
  offerCoupon?: string;
  offerDescription?: string;
  offerTerms?: string;
  offerPage?: string;
  offerType?: string | number; // 1 = code, 2 = offer without code
  validTo?: string;
}

// trackingURL is "https://track.adtraction.com/t/t?a=<ad>&as=<channel>&t=2&tk=1"; epi carries our ref and url the
// page, as in their deeplink generator (POST /v2/partner/tracking/link/)
export function mapProgram(p: Program): NetAdvertiser {
  const link = (p.trackingURL ?? "").trim();
  return {
    id: String(p.programId),
    name: p.programName.trim(),
    website: siteOf(p.programURL),
    trackingTemplate: /^https:\/\//.test(link) ? `${link}&epi={ref}&url={url}` : "",
  };
}

// Offers have no title: the description is the headline and the terms go underneath
export function mapOffer(o: Offer): NetOffer {
  const code = (o.offerCoupon ?? "").trim();
  const title = (o.offerDescription ?? "").trim();
  return {
    id: String(o.offerId),
    advertiserId: String(o.programId),
    kind: String(o.offerType) === "1" && code ? "code" : "deal",
    title,
    code: String(o.offerType) === "1" ? code : "",
    discount: discountBadge(title),
    description: (o.offerTerms ?? "").trim(),
    url: o.offerPage ?? "",
    expires: isoDay(o.validTo),
  };
}

export const adtraction: NetworkAdapter = {
  id: "adtraction",
  label: "Adtraction",
  fields: [
    { name: "channelId", label: "ID del canal (tu sitio)", secret: false, numeric: true, placeholder: "p. ej. 24577691", help: "Es el «as» de tus enlaces de Adtraction" },
    { name: "token", label: "API token", secret: true },
  ],
  docs: "https://apidocs.adtraction.net/nextgen/",
  where: "Adtraction → Account → Settings (API token)",
  ref: (c) => `Canal ${c.channelId}`,
  async fetchFeed(c: Credentials) {
    required(c, "channelId", "token");
    if (!/^\d+$/.test(c.channelId)) throw new Error("El ID del canal de Adtraction es un número");
    const init = (body: object) => ({
      method: "POST",
      headers: { "X-Token": c.token, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ market: REGION, channelId: Number(c.channelId), ...body }),
    });
    // ponytail: neither list is paginated in the docs; add paging if a big account comes back cut
    const programs = await getJson<Program[]>(`${API}/v3/partner/programs/`, init({ approvalStatus: APPROVED }));
    const offers = await getJson<Offer[]>(`${API}/v2/partner/offers/`, init({}));
    const advertisers = new Map(programs.map((p) => [String(p.programId), mapProgram(p)]));
    return {
      advertisers: [...advertisers.values()],
      // an offer only tracks through a programme we're approved in
      offers: offers.filter((o) => advertisers.has(String(o.programId))).map(mapOffer).filter((o) => o.title),
    };
  },
};
