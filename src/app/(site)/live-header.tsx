import Link from "next/link";
import { CATEGORIES, categoryPath } from "@/lib/catalog";
import { menuCategories } from "@/lib/category-pages";
import { siteCoupons } from "@/lib/public-site";
import { getReader } from "@/lib/reader";
import { readerAccountsEnabled } from "@/lib/settings";
import { withoutPerks } from "@/lib/perks";
import { SiteHeader } from "./site-header";

// Reads the signed-in reader on the server, so the client header never touches cookies, and which categories have
// live coupons, so the bar leaves out the empty ones
export async function LiveHeader() {
  const [reader, coupons, accounts] = await Promise.all([getReader(), siteCoupons(), readerAccountsEnabled()]);
  return <SiteHeader live reader={reader ? { handle: reader.handle } : null} cats={menuCategories(withoutPerks(coupons))} accounts={accounts} />;
}

// The footer's category links: the same ones as the header's bar (all of them while the page is still loading)
export function FooterCategories({ slugs }: { slugs?: readonly string[] }) {
  return CATEGORIES.filter((c) => !slugs || slugs.includes(c.slug)).map((c, i) => (
    <span key={c.slug}>
      {i > 0 && " · "}
      <Link href={categoryPath(c.slug)}>{c.label}</Link>
    </span>
  ));
}

export async function LiveFooterCategories() {
  return <FooterCategories slugs={menuCategories(withoutPerks(await siteCoupons()))} />;
}
