import { discountBadge } from "../discount.ts";
import { allPages, getJson, isoDay, REGION, required, siteOf, type Credentials, type NetAdvertiser, type NetOffer, type NetworkAdapter } from "./types.ts";

// Awin Publisher API — help.awin.com/apidocs: GET /publishers/{id}/programmes, POST /publisher/{id}/promotions
const API = "https://api.awin.com";
const PAGE = 200;

interface Programme { id: number; name: string; displayUrl?: string; logoUrl?: string }
interface Promotion {
  promotionId: number;
  type: "promotion" | "voucher";
  advertiser: { id: number; name: string };
  title: string;
  description?: string;
  url?: string;
  endDate?: string;
  voucher?: { code: string | null };
}

export function mapProgramme(p: Programme): NetAdvertiser {
  return { id: String(p.id), name: p.name.trim(), website: siteOf(p.displayUrl), trackingTemplate: "" };
}

export function mapPromotion(p: Promotion): NetOffer | null {
  const code = p.voucher?.code?.trim() ?? "";
  if (p.type === "voucher" && !code) return null; // code hidden: not joined to that advertiser
  return {
    id: String(p.promotionId),
    advertiserId: String(p.advertiser.id),
    kind: code ? "code" : "deal",
    title: p.title.trim(),
    code,
    discount: discountBadge(p.title) || discountBadge(p.description ?? ""),
    description: (p.description ?? "").trim(),
    url: p.url ?? "",
    expires: isoDay(p.endDate),
  };
}

export const awin: NetworkAdapter = {
  id: "awin",
  label: "Awin",
  fields: [
    { name: "publisherId", label: "Publisher ID", secret: false },
    { name: "token", label: "API token", secret: true },
  ],
  where: "Awin → Toolbox → API Credentials (ui.awin.com/awin-api)",
  ref: (c) => `Publisher ${c.publisherId}`,
  async fetchFeed(c: Credentials) {
    required(c, "publisherId", "token");
    if (!/^\d+$/.test(c.publisherId)) throw new Error("El Publisher ID de Awin es un número");
    const headers = { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" };
    const programmes = await getJson<Programme[]>(
      `${API}/publishers/${c.publisherId}/programmes?relationship=joined&countryCode=${REGION}`,
      { headers },
    );
    const promotions = await allPages(PAGE, async (page) => {
      const r = await getJson<{ data?: Promotion[] }>(`${API}/publisher/${c.publisherId}/promotions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          filters: { membership: "joined", regionCodes: [REGION], status: "active", type: "all" },
          pagination: { page, pageSize: PAGE },
        }),
      });
      return r.data ?? [];
    });
    // an offer's advertiser may be joined outside the region filter: still known by id and name
    const advertisers = new Map(programmes.map((p) => [String(p.id), mapProgramme(p)]));
    for (const p of promotions) {
      const id = String(p.advertiser.id);
      if (!advertisers.has(id)) advertisers.set(id, { id, name: p.advertiser.name.trim(), website: siteOf(p.url), trackingTemplate: "" });
    }
    return {
      advertisers: [...advertisers.values()],
      offers: promotions.map(mapPromotion).filter((o): o is NetOffer => o !== null),
    };
  },
};
