import assert from "node:assert/strict";
import { test } from "node:test";
import { dealRouteVerdict, dealVisibility, storeRouteVerdict } from "./site-routes.ts";

const T = "2026-11-06";
const row = (over: Partial<Parameters<typeof dealVisibility>[0] & { id: number; title: string; store_name: string }> = {}) => ({
  id: 42,
  title: "15% extra con CLAB15",
  store_name: "43einhalb",
  store_website: "https://www.43einhalb.com",
  verified: 1,
  archived: 0,
  expires_at: "",
  source: "manual",
  review: "",
  ...over,
});

test("dealVisibility: live, expired once public, gone otherwise", () => {
  assert.equal(dealVisibility(row(), T, false), "live");
  assert.equal(dealVisibility(row({ expires_at: "2026-10-01" }), T, false), "expired");
  assert.equal(dealVisibility(row({ archived: 1 }), T, false), "gone");
  assert.equal(dealVisibility(row({ review: "pending" }), T, false), "gone");
  assert.equal(dealVisibility(row({ source: "web", verified: 0 }), T, false), "gone");
  assert.equal(dealVisibility(row({ source: "web", verified: 0 }), T, true), "live");
  assert.equal(dealVisibility(row({ source: "web", verified: 0, expires_at: "2026-10-01" }), T, false), "gone");
  assert.equal(dealVisibility(row({ store_website: "https://www.jdsports.it" }), T, false), "gone");
});

test("dealRouteVerdict: canonical path is ok", () => {
  assert.deepEqual(dealRouteVerdict("42-43einhalb-15-extra-con-clab15", row(), T, false), { kind: "ok" });
});

test("dealRouteVerdict: expired deals keep their page", () => {
  assert.deepEqual(dealRouteVerdict("42-43einhalb-15-extra-con-clab15", row({ expires_at: "2026-10-01" }), T, false), { kind: "ok" });
});

test("dealRouteVerdict: old or mistyped words move to the canonical path", () => {
  assert.deepEqual(dealRouteVerdict("42-old-words", row(), T, false), { kind: "moved", to: "/chollos/42-43einhalb-15-extra-con-clab15" });
  assert.deepEqual(dealRouteVerdict("42", row(), T, false), { kind: "moved", to: "/chollos/42-43einhalb-15-extra-con-clab15" });
});

test("dealRouteVerdict: no id, no row, or a hidden deal is missing", () => {
  assert.deepEqual(dealRouteVerdict("no-id", row(), T, false), { kind: "missing" });
  assert.deepEqual(dealRouteVerdict("42-x", undefined, T, false), { kind: "missing" });
  assert.deepEqual(dealRouteVerdict("42-x", row({ archived: 1 }), T, false), { kind: "missing" });
  assert.deepEqual(dealRouteVerdict("42-x", row({ store_website: "https://bergfreunde.de" }), T, false), { kind: "missing" });
});

test("dealRouteVerdict: an id from another row never matches", () => {
  assert.deepEqual(dealRouteVerdict("7-x", row(), T, false), { kind: "missing" });
});

test("storeRouteVerdict: Spanish stores are ok, missing or foreign ones are not", () => {
  assert.deepEqual(storeRouteVerdict({ website: "https://www.adidas.es" }), { kind: "ok" });
  assert.deepEqual(storeRouteVerdict({ website: "" }), { kind: "ok" });
  assert.deepEqual(storeRouteVerdict({ website: "https://www.jdsports.it" }), { kind: "missing" });
  assert.deepEqual(storeRouteVerdict(undefined), { kind: "missing" });
});
