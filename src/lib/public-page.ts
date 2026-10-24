import { listCoupons, type Client, type Store } from "./db";
import { isPublic, today } from "./coupon-status.ts";
import { publishUnverified } from "./settings.ts";
import { renderPage } from "./render-page.ts";

// The reader-facing coupon page for one client × store: only live coupons.
// trackBase = our absolute origin; omitted for unsaved previews (no client row to attribute clicks to).
export async function publicPageHtml(client: Client, store: Store, trackBase?: string): Promise<string> {
  const now = new Date();
  const [all, unverified] = await Promise.all([listCoupons(store.id), publishUnverified()]);
  const coupons = all.filter((c) => isPublic(c, today(now), unverified));
  return renderPage(client, store, coupons, now, client.id > 0 ? trackBase : undefined);
}
