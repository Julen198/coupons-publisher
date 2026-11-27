import { test } from "node:test";
import assert from "node:assert/strict";
import { fingerprint, INDEXNOW_MAX_URLS, pagesToPing, pingBatch } from "./indexnow-sync.ts";

test("fingerprint: same parts, same value; any change, a new one", () => {
  assert.equal(fingerprint([1, "a"]), fingerprint([1, "a"]));
  assert.notEqual(fingerprint([1, "a"]), fingerprint([1, "b"]));
  assert.equal(fingerprint([]).length, 16);
});

test("pagesToPing: first run sends everything", () => {
  const r = pagesToPing([{ path: "/", sig: "x" }, { path: "/tiendas", sig: "y" }], new Map());
  assert.deepEqual(r, { changed: ["/", "/tiendas"], gone: [] });
});

test("pagesToPing: only new, changed and gone pages", () => {
  const prev = new Map([["/", "a"], ["/tiendas/nike", "b"], ["/chollos/old-1", "c"]]);
  const r = pagesToPing([{ path: "/", sig: "a" }, { path: "/tiendas/nike", sig: "B" }, { path: "/chollos/new-2", sig: "d" }], prev);
  assert.deepEqual(r, { changed: ["/tiendas/nike", "/chollos/new-2"], gone: ["/chollos/old-1"] });
});

test("pagesToPing: nothing changed, nothing to send", () => {
  assert.deepEqual(pagesToPing([{ path: "/", sig: "a" }], new Map([["/", "a"]])), { changed: [], gone: [] });
});

test("pingBatch: home first, no duplicates, capped", () => {
  assert.deepEqual(pingBatch(["/tiendas", "/"], ["/chollos/x"]), ["/", "/tiendas", "/chollos/x"]);
  const many = Array.from({ length: INDEXNOW_MAX_URLS + 5 }, (_, i) => `/chollos/${i}`);
  assert.equal(pingBatch(many, []).length, INDEXNOW_MAX_URLS);
});
