import assert from "node:assert/strict";
import { test } from "node:test";
import { dealRouteVerdict, dealVisibility, isDocumentRequest, storeRouteVerdict } from "./site-routes.ts";

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
  assert.equal(dealVisibility(row({ store_name: "43einhalb DE" }), T, false), "gone", "a store named for another country");
  assert.equal(dealVisibility(row({ store_country: "DE" }), T, false), "gone");
  assert.equal(dealVisibility(row({ store_website: "https://www.jdsports.it", store_country: "ES" }), T, false), "live");
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

test("a deal whose link can't be tracked has no page, live or expired, whatever publish-unverified says", () => {
  assert.equal(dealVisibility(row(), T, true, false), "gone");
  assert.equal(dealVisibility(row({ expires_at: "2026-10-01" }), T, true, false), "gone");
  assert.deepEqual(dealRouteVerdict("42-43einhalb-15-extra-con-clab15", row(), T, true, false), { kind: "missing" });
});

test("dealRouteVerdict: an id from another row never matches", () => {
  assert.deepEqual(dealRouteVerdict("7-x", row(), T, false), { kind: "missing" });
});

test("storeRouteVerdict: Spanish stores are ok, missing or foreign ones are not", () => {
  const st = (website: string, name = "Tienda", slug = "tienda", country?: string) => ({ name, slug, website, country });
  assert.deepEqual(storeRouteVerdict(st("https://www.adidas.es")), { kind: "ok" });
  assert.deepEqual(storeRouteVerdict(st("")), { kind: "ok" });
  assert.deepEqual(storeRouteVerdict(st("https://www.jdsports.it")), { kind: "missing" });
  assert.deepEqual(storeRouteVerdict(st("https://de.myprotein.com", "Myprotein DE", "myprotein-de")), { kind: "missing" });
  assert.deepEqual(storeRouteVerdict(st("https://www.pccomponentes.com", "PcComponentes", "pccomponentes", "FR")), { kind: "missing" });
  assert.deepEqual(storeRouteVerdict(st("https://www.jdsports.it", "JD Sports", "jd-sports", "ES")), { kind: "ok" });
  assert.deepEqual(storeRouteVerdict(undefined), { kind: "missing" });
});

test("isDocumentRequest: only GET/HEAD HTML navigations, never RSC or prefetch fetches", () => {
  const html = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
  const url = (q = "") => new URL(`https://cuponlab.es/chollos/42-x${q}`);
  assert.equal(isDocumentRequest("GET", html, url()), true);
  assert.equal(isDocumentRequest("HEAD", html, url()), true);
  assert.equal(isDocumentRequest("POST", html, url()), false);
  assert.equal(isDocumentRequest("GET", "*/*", url()), false); // client router fetch() (RSC navigation / prefetch)
  assert.equal(isDocumentRequest("GET", null, url()), false);
  assert.equal(isDocumentRequest("GET", html, url("?_rsc=abc")), false);
  assert.equal(isDocumentRequest("GET", "TEXT/HTML", url()), true);
});
