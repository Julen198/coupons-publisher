import { discountBadge } from "../discount.ts";
import { allPages, getJson, isoDay, REGION, required, siteOf, type Credentials, type NetAdvertiser, type NetOffer, type NetworkAdapter } from "./types.ts";

// Admitad (Mitgo) publisher API — developers.mitgo.com: OAuth client_credentials, then
// GET /advcampaigns/website/{w_id}/ and /coupons/website/{w_id}/ (limit ≤ 500, offset)
const API = "https://api.admitad.com";
const PAGE = 500;

interface Program { id: number; name: string; site_url?: string; gotolink?: string; allow_deeplink?: boolean }
interface Coupon {
  id: number;
  name: string;
  description?: string;
  promocode?: string;
  species?: "promocode" | "action";
  discount?: string | null;
  date_end?: string | null;
  regions?: string[];
  campaign: { id: number; name: string; site_url?: string };
}

const https = (u = "") => u.replace(/^\/\//, "https://").replace(/^http:\/\//, "https://");

// gotolink + subid (our clickref) + ulp (the coupon's landing page) — the deeplink generator's own format
export function trackingTemplate(p: Program): string {
  if (!p.gotolink) return "";
  const base = https(p.gotolink).split("?")[0];
  return p.allow_deeplink ? `${base}?subid={ref}&ulp={url}` : `${base}?subid={ref}`;
}

export function mapProgram(p: Program): NetAdvertiser {
  return { id: String(p.id), name: p.name.trim(), website: siteOf(p.site_url), trackingTemplate: trackingTemplate(p) };
}

export function mapCoupon(c: Coupon): NetOffer | null {
  if (c.regions?.length && !c.regions.includes(REGION)) return null;
  const code = c.species === "promocode" ? (c.promocode ?? "").trim() : "";
  return {
    id: String(c.id),
    advertiserId: String(c.campaign.id),
    kind: code ? "code" : "deal",
    title: c.name.trim(),
    code,
    discount: discountBadge(c.discount ?? "") || discountBadge(c.name),
    description: (c.description ?? "").trim(),
    url: siteOf(c.campaign.site_url),
    expires: isoDay(c.date_end),
  };
}

async function token(c: Credentials): Promise<string> {
  const r = await getJson<{ access_token: string }>(`${API}/token/`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: c.clientId, scope: "advcampaigns_for_website coupons_for_website" }),
  });
  return r.access_token;
}

export const admitad: NetworkAdapter = {
  id: "admitad",
  label: "Admitad",
  fields: [
    { name: "clientId", label: "Client ID", secret: false },
    { name: "clientSecret", label: "Client secret", secret: true },
    { name: "websiteId", label: "ID del espacio publicitario (w_id)", secret: false },
  ],
  where: "Admitad → perfil → Credenciales (Show credentials); el w_id está en Espacios publicitarios",
  ref: (c) => `Espacio ${c.websiteId}`,
  async fetchFeed(c: Credentials) {
    required(c, "clientId", "clientSecret", "websiteId");
    if (!/^\d+$/.test(c.websiteId)) throw new Error("El ID del espacio publicitario de Admitad es un número");
    const headers = { Authorization: `Bearer ${await token(c)}` };
    const list = <T>(path: string) =>
      allPages(PAGE, async (n) =>
        (await getJson<{ results: T[] }>(`${API}${path}${path.includes("?") ? "&" : "?"}limit=${PAGE}&offset=${(n - 1) * PAGE}`, { headers })).results,
      );
    const programs = await list<Program>(`/advcampaigns/website/${c.websiteId}/?connection_status=active`);
    const coupons = await list<Coupon>(`/coupons/website/${c.websiteId}/?language=es`);
    const advertisers = new Map(programs.map((p) => [String(p.id), mapProgram(p)]));
    return {
      advertisers: [...advertisers.values()],
      // a coupon only works with its program's link, so programs we're not connected to are dropped
      offers: coupons.map(mapCoupon).filter((o): o is NetOffer => o !== null && advertisers.has(o.advertiserId)),
    };
  },
};
