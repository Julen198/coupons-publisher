import { test } from "node:test";
import assert from "node:assert/strict";
import { bingDay, bingKeyProblem, queriesBetween, rowsOfQueries, rowsOfTraffic } from "./bing-api.ts";

test("bingDay: Bing's /Date(ms±zone)/ to a day; anything else is empty", () => {
  assert.equal(bingDay("/Date(1732003200000-0800)/"), "2024-11-19");
  assert.equal(bingDay("/Date(1732003200000)/"), "2024-11-19");
  assert.equal(bingDay("2024-11-19"), "");
  assert.equal(bingDay(undefined), "");
});

test("bingKeyProblem: missing, malformed or fine", () => {
  assert.equal(bingKeyProblem(""), "sin clave");
  assert.equal(bingKeyProblem(undefined), "sin clave");
  assert.equal(bingKeyProblem('"abc def"'), "clave no válida");
  assert.equal(bingKeyProblem(" 0123456789abcdef0123456789abcdef "), "");
});

test("rowsOfTraffic and rowsOfQueries read the d array and drop rows without a date or query", () => {
  assert.deepEqual(rowsOfTraffic([{ Date: "/Date(1732003200000-0800)/", Clicks: 3, Impressions: 40 }, { Clicks: 1 }]), [{ day: "2024-11-19", clicks: 3, impressions: 40 }]);
  const q = rowsOfQueries([{ Date: "/Date(1732003200000-0800)/", Query: " Cupón Shein ", Clicks: 2, Impressions: 10, AvgImpressionPosition: 4 }, { Date: "/Date(1732003200000)/", Query: "" }]);
  assert.deepEqual(q, [{ day: "2024-11-19", query: "cupón shein", clicks: 2, impressions: 10, position: 4 }]);
});

test("queriesBetween: weeks inside the range summed per query, position weighted by impressions, -1 ignored", () => {
  const rows = [
    { day: "2026-11-07", query: "shein", clicks: 2, impressions: 10, position: 4 },
    { day: "2026-11-14", query: "shein", clicks: 1, impressions: 30, position: 8 },
    { day: "2026-11-14", query: "temu", clicks: 0, impressions: 5, position: -1 },
    { day: "2026-10-31", query: "shein", clicks: 9, impressions: 99, position: 1 }, // before the range
  ];
  const got = queriesBetween(rows, "2026-11-01", "2026-11-20");
  assert.deepEqual(got.find((r) => r.keys[0] === "shein"), { keys: ["shein"], clicks: 3, impressions: 40, position: 7 });
  assert.deepEqual(got.find((r) => r.keys[0] === "temu"), { keys: ["temu"], clicks: 0, impressions: 5, position: 0 });
  assert.deepEqual(queriesBetween(rows, "2026-11-21", "2026-11-21"), []);
});
