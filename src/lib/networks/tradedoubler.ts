import { discountBadge } from "../discount.ts";
import { allPages, getJson, isoDay, required, siteOf, type Credentials, type NetAdvertiser, type NetOffer, type NetworkAdapter } from "./types.ts";

// Tradedoubler Vouchers API — dev.tradedoubler.com/vouchers/publisher: GET /1.0/vouchers.json;key=value?token=
// It only lists vouchers of programmes the site has joined; there's no programme list with this token,
// so advertisers come from the vouchers themselves.
const PAGE = 1000;

interface Voucher {
  id: number;
  programId: number;
  programName: string;
  code?: string;
  title: string;
  shortDescription?: string;
  description?: string;
  endDate?: string | number;
  voucherTypeId: number; // 1 voucher, 2 discount, 3 free article, 4 free shipping, 5 raffle, 6 promotion
  defaultTrackUri?: string;
  landingUrl?: string;
  discountAmount?: number;
  isPercentage?: boolean;
}

// The click link with our site id, rebuilt as a template: "click?p(123)a(456)…" or "click?p=123&a=456…"
export function trackingTemplate(defaultTrackUri = ""): string {
  const p = defaultTrackUri.match(/[?&)]p[=(](\d+)/)?.[1];
  const a = defaultTrackUri.match(/[?&)]a[=(](\d+)/)?.[1];
  return p && a ? `https://clk.tradedoubler.com/click?p=${p}&a=${a}&epi={ref}&url={url}` : "";
}

const discountOf = (v: Voucher) => {
  if (v.discountAmount) return `${v.discountAmount}${v.isPercentage ? "%" : "€"}`;
  if (v.voucherTypeId === 4) return "Envío gratis";
  return discountBadge(v.title) || discountBadge(v.shortDescription ?? "");
};

export function mapVoucher(v: Voucher): NetOffer {
  const code = v.voucherTypeId === 1 ? (v.code ?? "").trim() : "";
  return {
    id: String(v.id),
    advertiserId: String(v.programId),
    kind: code ? "code" : "deal",
    title: v.title.trim(),
    code,
    discount: discountOf(v),
    description: (v.description || v.shortDescription || "").trim(),
    url: v.landingUrl ?? "",
    expires: isoDay(v.endDate),
  };
}

export function advertiserOf(v: Voucher): NetAdvertiser {
  return { id: String(v.programId), name: v.programName.trim(), website: siteOf(v.landingUrl), trackingTemplate: trackingTemplate(v.defaultTrackUri) };
}

export const tradedoubler: NetworkAdapter = {
  id: "tradedoubler",
  label: "Tradedoubler",
  fields: [{ name: "token", label: "Token de Vouchers", secret: true, help: "Token del sistema VOUCHERS (40 caracteres)" }],
  docs: "https://dev.tradedoubler.com/vouchers/publisher/",
  where: "Tradedoubler → Account → Manage tokens → VOUCHERS",
  ref: (c) => `Token …${c.token.slice(-4)}`,
  async fetchFeed(c: Credentials) {
    required(c, "token");
    const now = new Date().toISOString().slice(0, 19) + "Z";
    const vouchers = await allPages(PAGE, (page) =>
      getJson<Voucher[]>(
        `https://api.tradedoubler.com/1.0/vouchers.json;pageSize=${PAGE};page=${page};minEndDate=${now};dateOutputFormat=iso8601?token=${encodeURIComponent(c.token)}`,
      ),
    );
    const advertisers = new Map<string, NetAdvertiser>();
    for (const v of vouchers) {
      const a = advertiserOf(v);
      const known = advertisers.get(a.id);
      advertisers.set(a.id, known ? { ...known, website: known.website || a.website, trackingTemplate: known.trackingTemplate || a.trackingTemplate } : a);
    }
    return { advertisers: [...advertisers.values()], offers: vouchers.map(mapVoucher) };
  },
};
