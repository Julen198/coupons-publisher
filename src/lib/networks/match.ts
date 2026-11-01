import { slugify } from "../form.ts";
import type { NetAdvertiser } from "./types.ts";

export interface StoreRef {
  id: number;
  slug: string;
  website: string;
  network: string;
  merchant_id: string;
  tracking_url: string;
}

export type Match =
  | { kind: "linked"; store: StoreRef } // already this network's store for that advertiser
  | { kind: "claim"; store: StoreRef } // same shop, not tied to any advertiser yet → becomes this network's
  | { kind: "other-network"; store: StoreRef } // same shop, but its links go through another network/advertiser
  | { kind: "none" };

const host = (url: string) => (URL.canParse(url) ? new URL(url).hostname.toLowerCase().replace(/^www\d?\./, "") : "");

// "adidas ES", "Zalando - España", "PcComponentes (ES)" → the shop's own name
export const cleanAdvertiserName = (name: string) =>
  name.replace(/\s*[-–|(]?\s*\b(ES|ESP|Spain|España|Espana)\b\)?\s*$/i, "").trim() || name.trim();

// One store per shop, one network per store: by advertiser id first, then same domain, then same slug
export function matchStore(network: string, adv: NetAdvertiser, stores: StoreRef[]): Match {
  const linked = stores.find((s) => s.network === network && s.merchant_id === adv.id);
  if (linked) return { kind: "linked", store: linked };
  const h = host(adv.website);
  const slug = slugify(cleanAdvertiserName(adv.name));
  const same = stores.find((s) => (h && host(s.website) === h) || (slug && s.slug === slug));
  if (!same) return { kind: "none" };
  // free to take: no advertiser yet and no working links through another network
  const tracked = same.network === "awin" ? Boolean(same.merchant_id) : Boolean(same.tracking_url);
  const free = !same.merchant_id && (same.network === network || !tracked);
  return free ? { kind: "claim", store: same } : { kind: "other-network", store: same };
}
