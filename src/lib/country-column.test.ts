import { test } from "node:test";
import assert from "node:assert/strict";
import { countrySql, isMissingCountry, withCountryColumn } from "./country-column.ts";

const missing = Object.assign(new Error('column s.country does not exist'), { code: "42703" });
const otherMissing = Object.assign(new Error('column s.wordmark_data does not exist'), { code: "42703" });

test("withCountryColumn falls back while stores.country is missing, and checks again after a few minutes", async () => {
  let t = 0;
  const now = () => t;
  const calls: boolean[] = [];
  const run = async (present: boolean) => {
    calls.push(present);
    if (present) throw missing;
    return "ok";
  };
  assert.equal(await withCountryColumn(run, now), "ok");
  assert.deepEqual(calls, [true, false]);
  t = 60_000;
  await withCountryColumn(run, now);
  assert.deepEqual(calls, [true, false, false], "no retry within 5 minutes");
  t = 6 * 60_000;
  await withCountryColumn(run, now);
  assert.deepEqual(calls, [true, false, false, true, false]);
  t = 20 * 60_000;
  assert.equal(await withCountryColumn(async (present) => present, now), true);
});

test("another missing column (the wordmark one) is not taken for the country one", async () => {
  assert.equal(isMissingCountry(missing), true);
  assert.equal(isMissingCountry(Object.assign(new Error('column "country_source" does not exist'), { code: "42703" })), true);
  assert.equal(isMissingCountry(otherMissing), false);
  await assert.rejects(withCountryColumn(async () => { throw otherMissing; }, () => 1e13), /wordmark_data/);
  await assert.rejects(withCountryColumn(async () => { throw new Error("boom"); }, () => 1e13), /boom/);
});

test("countrySql: the columns, or empty strings while they are missing", () => {
  assert.equal(countrySql(true, "s"), "s.country AS store_country, s.country_source AS store_country_source");
  assert.equal(countrySql(false, "s"), "'' AS store_country, '' AS store_country_source");
  assert.equal(countrySql(true, "stores", ""), "stores.country AS country, stores.country_source AS country_source");
  assert.equal(countrySql(false, "stores", ""), "'' AS country, '' AS country_source");
});
