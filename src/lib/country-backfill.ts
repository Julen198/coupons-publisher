import { inferStoreCountry } from "./market.ts";

// What scripts/backfill-store-country.ts writes: stores with no country and not set by hand or by a network get the
// inferred one (country_source 'inferred'); those with no signal stay "" (the site then follows their domain).
export type BackfillRow = { id: number; slug: string; name: string; website: string; tracking_url: string; country: string; country_source: string };
export type BackfillPlan = {
  updates: { id: number; slug: string; country: string; reason: string }[];
  noSignal: string[]; // slugs
  kept: string[]; // "slug (country, source)" already decided
};

export function planCountryBackfill(rows: readonly BackfillRow[]): BackfillPlan {
  const plan: BackfillPlan = { updates: [], noSignal: [], kept: [] };
  for (const r of rows) {
    if (r.country || r.country_source === "manual" || r.country_source === "network") {
      plan.kept.push(`${r.slug} (${r.country || "sin definir"}, ${r.country_source || "sin origen"})`);
      continue;
    }
    const guess = inferStoreCountry({ name: r.name, slug: r.slug, website: r.website, trackingUrl: r.tracking_url });
    if (guess) plan.updates.push({ id: r.id, slug: r.slug, country: guess.country, reason: guess.reason });
    else plan.noSignal.push(r.slug);
  }
  return plan;
}
