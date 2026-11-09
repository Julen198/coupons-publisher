// A store, for one client: Activa (its page and widget are live), Inactiva, Bloqueada (a competitor: can't be switched
// on by accident) or Nueva (nobody has decided yet; every store starts so). Stored in pages.status: published, draft,
// blocked; no row = new. Pure, tested in store-states.test.ts.

export type PageStatus = "draft" | "published" | "blocked";
export type StoreState = "active" | "inactive" | "blocked" | "new";
export type StoreAction = "activate" | "deactivate" | "block" | "unblock";

export const STATE_LABEL: Record<StoreState, string> = { active: "Activa", inactive: "Inactiva", blocked: "Bloqueada", new: "Nueva" };

export function stateOf(status: PageStatus | undefined): StoreState {
  if (status === "published") return "active";
  if (status === "blocked") return "blocked";
  return status === "draft" ? "inactive" : "new";
}

// The status a button stores, or null when it doesn't apply (activating a blocked store needs «Desbloquear» first)
export function nextStatus(state: StoreState, action: StoreAction): PageStatus | null {
  if (action === "block") return "blocked";
  if (action === "unblock") return state === "blocked" ? "draft" : null;
  if (state === "blocked") return null;
  return action === "activate" ? "published" : "draft";
}

export interface StoreRow { storeId: number; slug: string; state: StoreState; live: number }

export type BulkAction = "activate" | "deactivate" | "review";

// «Activar todas»: every store not blocked and not already active, with something live to show.
// «Desactivar todas»: the active ones. «Marcar nuevas como revisadas»: the new ones (they stay off).
export function bulkTargets<T extends StoreRow>(rows: readonly T[], action: BulkAction): T[] {
  if (action === "activate") return rows.filter((r) => (r.state === "new" || r.state === "inactive") && r.live > 0);
  return rows.filter((r) => r.state === (action === "deactivate" ? "active" : "new"));
}

// /p/<client>/<store> (the widget's page): public only when active; signed-in panel users also see the others (preview)
export const canServePage = (status: PageStatus | undefined, panelUser: boolean): boolean => status === "published" || panelUser;
