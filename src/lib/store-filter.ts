import { storeLinkProblem } from "./tracked-link.ts";
import { effectiveCountry } from "./market.ts";

// ponytail: filters in memory over all stores; move to SQL WHERE/LIMIT if the list grows into the thousands

export interface StoreFilters {
  q?: string;
  network?: string;
  tracking?: "ok" | "missing";
  coupons?: "some" | "none";
  country?: string; // a code of COUNTRIES, or "none" (no stored or inferred country)
}

type FilterableStore = {
  id: number; name: string; website: string; network: string; merchant_id: string; tracking_url: string; publisher_id: string;
  slug?: string; country?: string; alt_domains?: string;
};

// The stored country, else the inferred one: what the panel shows and filters by
const countryOf = (s: FilterableStore) => effectiveCountry({ ...s, slug: s.slug ?? "" }).country;

const norm = (v: string) => v.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

// The same check the public site's gate makes (trackedLinkOf), at store level
const storeTracked = (s: FilterableStore) => storeLinkProblem({ ...s, slug: s.slug ?? "" }) === null;

export function filterStores<T extends FilterableStore>(stores: T[], f: StoreFilters, liveCoupons: Map<number, number>): T[] {
  const q = norm(f.q?.trim() ?? "");
  return stores.filter(
    (s) =>
      (!q || norm(s.name).includes(q) || norm(s.website).includes(q)) &&
      (!f.network || s.network === f.network) &&
      (!f.tracking || storeTracked(s) === (f.tracking === "ok")) &&
      (!f.coupons || (liveCoupons.get(s.id) ?? 0) > 0 === (f.coupons === "some")) &&
      (!f.country || countryOf(s) === (f.country === "none" ? "" : f.country)),
  );
}

export function paginate<T>(items: T[], page: number, size: number) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(Math.max(1, Math.trunc(page) || 1), pages);
  const rows = items.slice((p - 1) * size, p * size);
  return { rows, page: p, pages, from: rows.length ? (p - 1) * size + 1 : 0, to: (p - 1) * size + rows.length };
}
