import { test } from "node:test";
import assert from "node:assert/strict";
import { altDomainsColumn, altDomainsSql, clickColumns, columnGuard } from "./tracking-columns.ts";

const missing = (col: string) => Object.assign(new Error(`column "${col}" does not exist`), { code: "42703" });

test("a guard falls back while its column is missing and tries again after a few minutes", async () => {
  const g = columnGuard(/\bnew_col\b/);
  let t = 0;
  const calls: boolean[] = [];
  const run = async (present: boolean) => {
    calls.push(present);
    if (present) throw missing("new_col");
    return "ok";
  };
  assert.equal(await g.run(run, () => t), "ok");
  t = 60_000;
  await g.run(run, () => t);
  assert.deepEqual(calls, [true, false, false]);
  t = 6 * 60_000;
  await g.run(run, () => t);
  assert.deepEqual(calls, [true, false, false, true, false]);
});

test("each guard only takes its own columns; other errors go through", async () => {
  assert.equal(altDomainsColumn.isMissing(missing("alt_domains")), true);
  assert.equal(altDomainsColumn.isMissing(missing("country")), false);
  assert.equal(clickColumns.isMissing(Object.assign(new Error('column "ua_hash" of relation "clicks" does not exist'), { code: "42703" })), true);
  assert.equal(clickColumns.isMissing(missing("alt_domains")), false);
  await assert.rejects(columnGuard(/\bx\b/).run(async () => { throw new Error("boom"); }), /boom/);
});

test("altDomainsSql: the column, or an empty string while it is missing", () => {
  assert.equal(altDomainsSql(true, "s"), "s.alt_domains AS store_alt_domains");
  assert.equal(altDomainsSql(false, "stores", "alt_domains"), "'' AS alt_domains");
});
