import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { sql } from "@/lib/db";
import { cronAuthorized } from "@/lib/telegram";
import { recordSync, syncAccount, type NetworkAccount } from "@/lib/network-sync";
import { adapterFor } from "@/lib/networks/index";
import { networkError } from "@/lib/networks/types";
import { runScheduledSync, syncOrder } from "@/lib/sync-cron";
import { fillStoreIcons } from "@/lib/fill-store-icons";
import { fillProductImages } from "@/lib/fill-product-images";
import { translatePending } from "@/lib/translate-pending";
import { syncCommissions } from "@/lib/commissions";

// Vercel Pro allows up to 800 s; runScheduledSync stops starting accounts at 760 s
export const maxDuration = 800;

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Vercel cron every 6 hours (vercel.json): syncs every connected network account (ours and clients'), each within its
// own time budget, recording per account its last result and error (and last success). One failing network never stops
// the rest. Effiliation refreshes every 2 h and blocks keys that sync more often, so 6 h is safe for all of them.
// Auth first: no CRON_SECRET, no access.
export async function GET(req: Request) {
  if (!cronAuthorized(process.env.CRON_SECRET, req.headers.get("authorization"))) return new Response("Unauthorized", { status: 401 });
  try {
    const accounts = syncOrder(await sql()<(NetworkAccount & { last_sync_at: Date | null })[]>`SELECT * FROM network_accounts`);
    const newStores: string[] = [];
    const results = await runScheduledSync(accounts, {
      sync: async (account) => {
        const summary = await syncAccount(account);
        newStores.push(...summary.newStores);
        return summary;
      },
      record: recordSync,
      describeError: (account, e) => {
        const adapter = adapterFor(account.network);
        return adapter ? networkError(adapter, e) : `${account.network}: ${errorText(e)}`;
      },
    });
    for (const r of results) if (r.status !== "ok") console.error("network cron", r.network, r.id, r.error);
    // after the feeds: Awin's transactions, so Estadísticas shows what each store and origin earned
    after(() => Promise.all([fillStoreIcons(newStores), fillProductImages(), translatePending(), syncCommissions().then((c) => c.errors.forEach((e) => console.error("commissions", e)))]));
    revalidatePath("/", "layout");
    // ids, networks and outcomes only: no credentials or account refs
    return Response.json({
      accounts: results.map((r) => ({ id: r.id, network: r.network, status: r.status, ms: r.ms, ...(r.status === "ok" ? { created: r.summary.created, updated: r.summary.updated, archived: r.summary.archived ?? 0 } : { error: r.error }) })),
    });
  } catch (e) {
    console.error("network cron failed", e);
    return Response.json({ error: "Falló la sincronización programada" }, { status: 500 });
  }
}
