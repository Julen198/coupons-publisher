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
  regions?: unknown; // { all: true } or the list of countries it's valid in
}

// regionCodes:["ES"] still lets through promotions valid in "all" regions, from Italian, German… programmes.
// One belongs here when its programme is one of ours in Spain, or when it names Spain itself.
export function forSpain(p: Pick<Promotion, "advertiser" | "regions">, spanishProgrammes: Set<string>): boolean {
  if (spanishProgrammes.has(String(p.advertiser.id))) return true;
  const regions = p.regions as { all?: boolean } | undefined;
  return !regions?.all && new RegExp(`"${REGION}"`).test(JSON.stringify(regions ?? ""));
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

// The token as pasted, «Bearer …» included or not
export const bearer = (token: string) => `Bearer ${token.trim().replace(/^bearer\s+/i, "")}`;

export interface AwinAccount { id: string; name: string }

// GET /accounts: every account the token's user reaches; only publisher ones can read promotions
export function parseAwinAccounts(v: unknown): AwinAccount[] {
  const rows = (v as { accounts?: unknown } | null)?.accounts;
  return (Array.isArray(rows) ? rows : [])
    .filter((a): a is Record<string, unknown> => !!a && typeof a === "object" && a.accountType === "publisher")
    .map((a) => ({ id: String(a.accountId), name: String(a.accountName ?? a.accountId) }));
}

export function pickAwinAccount(accounts: AwinAccount[]): string {
  if (accounts.length === 1) return accounts[0].id;
  if (!accounts.length) throw new Error("Ese token no tiene acceso a ninguna cuenta de publisher en Awin");
  const list = accounts.map((a) => `${a.name} (${a.id})`).join(", ");
  throw new Error(`Tu usuario de Awin tiene varias cuentas: ${list}. Escribe el Publisher ID de la que quieres conectar.`);
}

// The publisher id when the form left it empty: the token alone says which account it is, unless it reaches several
export async function awinPublisherId(token: string): Promise<string> {
  return pickAwinAccount(parseAwinAccounts(await getJson<unknown>(`${API}/accounts`, { headers: { Authorization: bearer(token) } })));
}

export const awin: NetworkAdapter = {
  id: "awin",
  label: "Awin",
  fields: [
    { name: "token", label: "API token", secret: true, placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" },
    { name: "publisherId", label: "Publisher ID", secret: false, numeric: true, placeholder: "p. ej. 123456", optional: "solo si tu usuario tiene varias cuentas", help: "Es también el awinaffid de los enlaces" },
  ],
  docs: "https://help.awin.com/apidocs/introduction-1",
  where: "Awin → Toolbox → API Credentials (ui.awin.com/awin-api)",
  ref: (c) => `Publisher ${c.publisherId}`,
  async fetchFeed(c: Credentials) {
    required(c, "publisherId", "token");
    if (!/^\d+$/.test(c.publisherId)) throw new Error("El Publisher ID de Awin es un número");
    const headers = { Authorization: bearer(c.token), "Content-Type": "application/json" };
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
    const advertisers = new Map(programmes.map((p) => [String(p.id), mapProgramme(p)]));
    const spanish = promotions.filter((p) => forSpain(p, new Set(advertisers.keys())));
    // a programme joined outside Spain whose promotion names Spain: still known by id and name
    for (const p of spanish) {
      const id = String(p.advertiser.id);
      if (!advertisers.has(id)) advertisers.set(id, { id, name: p.advertiser.name.trim(), website: siteOf(p.url), trackingTemplate: "" });
    }
    return {
      advertisers: [...advertisers.values()],
      offers: spanish.map(mapPromotion).filter((o): o is NetOffer => o !== null),
    };
  },
};
