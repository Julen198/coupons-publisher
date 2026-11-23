import { discountBadge } from "../discount.ts";
import { allPages, getJson, isoDay, required, siteOf, type Credentials, type NetAdvertiser, type NetOffer, type NetworkAdapter } from "./types.ts";

// Tradedoubler Vouchers API — dev.tradedoubler.com/vouchers/publisher: GET /1.0/vouchers.json;key=value?token=
// It only lists vouchers of programmes the site has joined; there's no programme list with this token,
// so advertisers come from the vouchers themselves.
const PAGE = 1000;

export interface Voucher {
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

// A link pasted by hand in the store form, as Tradedoubler hands it out (My Programs → tracking link generator:
// "click?p=270504&a=3123456&g=25987654", no placeholders). Without {url} every click would land on the home page and
// carry no subid, so it becomes the same template the sync writes. Anything else is left as typed.
export function pastedTemplate(link: string): { template: string; programId: string } | null {
  if (!link || link.includes("{url}") || !/^https?:\/\/clk\.tradedoubler\.com\//i.test(link.trim())) return null;
  const template = trackingTemplate(link.trim());
  return template ? { template, programId: template.match(/[?&]p=(\d+)/)?.[1] ?? "" } : null;
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

// The plain call (vouchers.json?token=) answers; with minEndDate and page=1 it came back empty for every programme, so
// it sends neither: expired ones are dropped here, and the pages are read from 0 and from 1 and joined by id, which is
// right whichever of the two Tradedoubler counts from. Dates come as epoch milliseconds in strings.
async function allVouchers(token: string): Promise<Voucher[]> {
  const page = (n: number) =>
    getJson<Voucher[]>(`https://api.tradedoubler.com/1.0/vouchers.json;pageSize=${PAGE};page=${n}?token=${encodeURIComponent(token)}`);
  const first = await page(0).catch(() => [] as Voucher[]);
  const rest = await allPages(PAGE, page);
  return [...new Map([...first, ...rest].map((v) => [v.id, v])).values()];
}

// Still running at `now`: an end date that is missing or not past
export function liveVouchers(vouchers: Voucher[], now: number): Voucher[] {
  return vouchers.filter((v) => {
    if (v.endDate === undefined || v.endDate === null || v.endDate === "") return true;
    const end = /^\d+$/.test(String(v.endDate)) ? Number(v.endDate) : Date.parse(String(v.endDate));
    return Number.isNaN(end) || end >= now;
  });
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
    const vouchers = liveVouchers(await allVouchers(c.token), Date.now());
    const advertisers = new Map<string, NetAdvertiser>();
    for (const v of vouchers) {
      const a = advertiserOf(v);
      const known = advertisers.get(a.id);
      advertisers.set(a.id, known ? { ...known, website: known.website || a.website, trackingTemplate: known.trackingTemplate || a.trackingTemplate } : a);
    }
    return { advertisers: [...advertisers.values()], offers: vouchers.map(mapVoucher) };
  },
};
