import { columnGuard } from "./tracking-columns.ts";

// stores.open_unverified («Cupones de internet sin verificar» on the store's panel page): a store without an affiliate
// network yet (AliExpress, Temu…) may show public coupons found on the web that nobody has checked, marked «Sin
// verificar», to start bringing readers in. While it has no tracked link, its «Ir a» button goes straight to the shop.
// The moment an affiliate network brings live coupons of that store, it closes again on its own: only the network's
// coupons show, and the next sync retires the web finds (see archiveOpenFinds).
// Until the column exists every store is closed, as before.
export const openUnverifiedColumn = columnGuard(/\bopen_unverified\b/);

// Sources that are not an affiliate network
export const NON_NETWORK_SOURCES = ["manual", "web"] as const;

// A live coupon of an affiliate network in the store `alias`: SQL, for EXISTS
const networkCouponSql = (alias: string) =>
  `SELECT 1 FROM coupons nc WHERE nc.store_id = ${alias}.id AND nc.archived = 0 AND nc.source NOT IN ('manual', 'web')
     AND (nc.expires_at = '' OR nc.expires_at >= to_char(now() AT TIME ZONE 'Europe/Madrid', 'YYYY-MM-DD'))`;

// For SELECTs on stores aliased `alias`: whether the store is open right now (switched on, and no live coupon of a network)
export const storeOpenSql = (present: boolean, alias: string, as = "store_open"): string =>
  present ? `(${alias}.open_unverified AND NOT EXISTS (${networkCouponSql(alias)})) AS ${as}` : `false AS ${as}`;

// The switch itself, as the editor left it
export const openSwitchSql = (present: boolean, alias: string, as = "open_unverified"): string =>
  present ? `${alias}.open_unverified AS ${as}` : `false AS ${as}`;
