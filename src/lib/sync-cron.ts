// The scheduled network sync (/api/networks/cron): every connected account in turn, each within its own time budget,
// one failing or slow network never stopping the rest. Pure orchestration (the sync and the bookkeeping are passed in)
// so it tests without a database or the networks.

export interface CronAccount { id: number; network: string }

export type AccountOutcome<S> =
  | { id: number; network: string; status: "ok"; summary: S; ms: number }
  | { id: number; network: string; status: "error"; error: string; ms: number }
  | { id: number; network: string; status: "skipped"; error: string; ms: 0 };

export interface CronDeps<A extends CronAccount, S> {
  sync: (account: A) => Promise<S>;
  record: (account: A, result: { summary?: S; error?: string }) => Promise<void>;
  describeError: (account: A, e: unknown) => string;
  now?: () => number;
}

export interface CronBudget {
  totalMs: number; // the whole run (under the function's maxDuration, with room to answer)
  perAccountMs: number; // one account at most
  minMs: number; // below this, an account isn't started (it would only time out)
}

// maxDuration is 800 s: the run stops starting accounts at 760 s; one account gets at most 5 minutes
export const CRON_BUDGET: CronBudget = { totalMs: 760_000, perAccountMs: 300_000, minMs: 20_000 };

// Rejects after ms; the work keeps running in the background (a sync can't be cancelled), its late result is dropped
function within<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`sin respuesta en ${Math.round(ms / 1000)} s`)), ms);
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

export async function runScheduledSync<A extends CronAccount, S>(accounts: readonly A[], deps: CronDeps<A, S>, budget: CronBudget = CRON_BUDGET): Promise<AccountOutcome<S>[]> {
  const now = deps.now ?? Date.now;
  const deadline = now() + budget.totalMs;
  const out: AccountOutcome<S>[] = [];
  for (const account of accounts) {
    const left = deadline - now();
    if (left < budget.minMs) {
      out.push({ id: account.id, network: account.network, status: "skipped", error: "sin tiempo en esta ejecución, va en la siguiente", ms: 0 });
      continue;
    }
    const started = now();
    try {
      const summary = await within(deps.sync(account), Math.min(budget.perAccountMs, left));
      await deps.record(account, { summary }).catch((e: unknown) => console.error("sync record failed", account.id, e));
      out.push({ id: account.id, network: account.network, status: "ok", summary, ms: now() - started });
    } catch (e) {
      const error = deps.describeError(account, e);
      await deps.record(account, { error }).catch((err: unknown) => console.error("sync record failed", account.id, err));
      out.push({ id: account.id, network: account.network, status: "error", error, ms: now() - started });
    }
  }
  return out;
}

// Accounts that synced longest ago go first, so one that keeps running out of time doesn't always starve the same ones
export function syncOrder<A extends CronAccount & { last_sync_at: Date | string | null }>(accounts: readonly A[]): A[] {
  const t = (a: A) => (a.last_sync_at ? new Date(a.last_sync_at).getTime() : 0);
  return [...accounts].sort((a, b) => t(a) - t(b) || a.id - b.id);
}
