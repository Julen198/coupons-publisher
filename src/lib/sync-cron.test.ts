import { test } from "node:test";
import assert from "node:assert/strict";
import { runScheduledSync, syncOrder } from "./sync-cron.ts";

const accounts = [{ id: 3, network: "awin" }, { id: 9, network: "effiliation" }, { id: 11, network: "impact" }];
const describeError = (a: { network: string }, e: unknown) => `${a.network}: ${e instanceof Error ? e.message : String(e)}`;

test("one failing network doesn't stop the rest, and each account's result is recorded", async () => {
  const recorded: [number, string][] = [];
  const out = await runScheduledSync(accounts, {
    sync: async (a) => {
      if (a.network === "effiliation") throw new Error("respondió 500");
      return { created: a.id };
    },
    record: async (a, r) => { recorded.push([a.id, r.error ?? "ok"]); },
    describeError,
  });
  assert.deepEqual(out.map((o) => o.status), ["ok", "error", "ok"]);
  assert.deepEqual(recorded, [[3, "ok"], [9, "effiliation: respondió 500"], [11, "ok"]]);
});

test("a slow account times out within its budget and the next one still runs", async () => {
  const out = await runScheduledSync(accounts.slice(0, 2), {
    sync: (a) => (a.id === 3 ? new Promise(() => {}) : Promise.resolve("done")),
    record: async () => {},
    describeError,
  }, { totalMs: 10_000, perAccountMs: 30, minMs: 1 });
  assert.equal(out[0].status, "error");
  assert.match(out[0].status === "error" ? out[0].error : "", /sin respuesta/);
  assert.equal(out[1].status, "ok");
});

test("accounts are not started once the run is out of time", async () => {
  let t = 0;
  const out = await runScheduledSync(accounts, {
    sync: async () => { t += 600; return "x"; },
    record: async () => {},
    describeError,
    now: () => t,
  }, { totalMs: 1000, perAccountMs: 900, minMs: 500 });
  assert.deepEqual(out.map((o) => o.status), ["ok", "skipped", "skipped"]);
});

test("a failing bookkeeping write doesn't fail the run", async () => {
  const out = await runScheduledSync(accounts.slice(0, 1), { sync: async () => 1, record: async () => { throw new Error("db"); }, describeError });
  assert.equal(out[0].status, "ok");
});

test("syncOrder: never synced first, then the oldest", () => {
  const rows = [
    { id: 1, network: "awin", last_sync_at: new Date("2026-11-05T10:00:00Z") },
    { id: 2, network: "cj", last_sync_at: null },
    { id: 3, network: "impact", last_sync_at: "2026-11-01T10:00:00Z" },
  ];
  assert.deepEqual(syncOrder(rows).map((r) => r.id), [2, 3, 1]);
});
