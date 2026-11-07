import { listCoupons, type Client, type Store } from "./db";
import { isPublic, today } from "./coupon-status.ts";
import { publishUnverified } from "./settings.ts";
import { renderPage } from "./render-page.ts";
import { publicText } from "./translation.ts";
import { isTracked, trackedLinkOf } from "./tracked-link.ts";
import { accountsFor, clientLinks } from "./link-accounts";

// The reader-facing coupon page for one client × store: only live coupons whose link is tracked (see trackedLinkOf).
// trackBase = our absolute origin; omitted for unsaved previews (no client row to attribute clicks to).
export async function publicPageHtml(client: Client, store: Store, trackBase?: string): Promise<string> {
  const now = new Date();
  const [all, unverified, links] = await Promise.all([listCoupons(store.id), publishUnverified(), clientLinks(client)]);
  const accounts = accountsFor(links, store);
  // coupons that came in another language read in Spanish, as on the public site
  const coupons = all
    .filter((c) => isPublic(c, today(now), unverified) && isTracked(trackedLinkOf(c, store, accounts)))
    .map((c) => ({ ...c, ...publicText(c) }));
  return renderPage(client, store, coupons, now, client.id > 0 ? trackBase : undefined, trackBase);
}
