// The reader's account page (/cuenta): its tabs and how a shared deal's state reads. Pure, so it tests without a database.

import { SHARING_ENABLED } from "./community-rules.ts";

const ALL_TABS = [
  { slug: "compartidos", label: "Compartidos" },
  { slug: "guardados", label: "Guardados" },
  { slug: "comentarios", label: "Comentarios" },
] as const;

export type AccountTab = (typeof ALL_TABS)[number]["slug"];

// Compartidos only while readers can share deals (SHARING_ENABLED)
export const accountTabs = (sharing = SHARING_ENABLED) => ALL_TABS.filter((t) => sharing || t.slug !== "compartidos");

export const ACCOUNT_TABS = accountTabs();

export const accountTabOf = (raw: string | string[] | undefined, sharing = SHARING_ENABLED): AccountTab => {
  const tabs = accountTabs(sharing);
  return tabs.find((t) => t.slug === raw)?.slug ?? tabs[0].slug;
};

// the first tab lives at the bare /cuenta
export const accountHref = (tab: AccountTab, sharing = SHARING_ENABLED): string => (tab === accountTabs(sharing)[0].slug ? "/cuenta" : `/cuenta?tab=${tab}`);

export type SharedStatus = { label: string; badge: "b-ok" | "b-exp" | "b-low" };

// A deal the reader shared: pending review, rejected, published, or taken down later by an editor
// (review_reason is optional: rows read before the column exists don't have it)
export function sharedStatus(c: { review: string; archived: number; review_reason?: string }): SharedStatus {
  if (c.review === "pending") return { label: "En revisión", badge: "b-exp" };
  if (c.review === "rejected") {
    const reason = c.review_reason?.trim();
    return { label: reason ? `Rechazado: ${reason}` : "Rechazado", badge: "b-low" };
  }
  return c.archived ? { label: "Retirado", badge: "b-exp" } : { label: "Publicado", badge: "b-ok" };
}

// Live deals first; each group keeps the order it came in (newest saved first)
export function liveFirst<T extends { live: boolean }>(rows: readonly T[]): T[] {
  return [...rows.filter((r) => r.live), ...rows.filter((r) => !r.live)];
}
