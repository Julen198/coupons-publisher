import { test } from "node:test";
import assert from "node:assert/strict";
import { hasWordmarkSql, withWordmarkColumn } from "./wordmark-column.ts";

const missing = Object.assign(new Error('column "wordmark_data" does not exist'), { code: "42703" });

test("withWordmarkColumn falls back while the column is missing, and checks again after a few minutes", async () => {
  let t = 0;
  const now = () => t;
  const calls: boolean[] = [];
  const run = async (present: boolean) => {
    calls.push(present);
    if (present) throw missing;
    return "ok";
  };
  assert.equal(await withWordmarkColumn(run, now), "ok");
  assert.deepEqual(calls, [true, false]);
  t = 60_000;
  await withWordmarkColumn(run, now);
  assert.deepEqual(calls, [true, false, false], "no retry within 5 minutes");
  t = 6 * 60_000;
  await withWordmarkColumn(run, now);
  assert.deepEqual(calls, [true, false, false, true, false]);
  t = 20 * 60_000;
  assert.equal(await withWordmarkColumn(async (present) => present, now), true);
});

test("withWordmarkColumn lets other errors through; hasWordmarkSql", async () => {
  await assert.rejects(withWordmarkColumn(async () => { throw new Error("boom"); }, () => 1e12), /boom/);
  assert.equal(hasWordmarkSql(true, "s"), "s.wordmark_data <> ''");
  assert.equal(hasWordmarkSql(false, "s"), "false");
});
