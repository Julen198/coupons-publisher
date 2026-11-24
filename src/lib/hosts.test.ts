import assert from "node:assert/strict";
import { test } from "node:test";
import { hostRole, hostVerdict, panelOrigin } from "./hosts.ts";

const PANEL = "https://cms.cuponlab.com";
const SITE = "https://www.cuponlab.com";

test("hostRole: only the two configured hosts are split", () => {
  assert.equal(hostRole("cms.cuponlab.com", PANEL, SITE), "panel");
  assert.equal(hostRole("www.cuponlab.com", PANEL, SITE), "site");
  assert.equal(hostRole("coupons-publisher-demo.vercel.app", PANEL, SITE), "any");
  assert.equal(hostRole("localhost:3000", PANEL, SITE), "any");
  assert.equal(hostRole("www.cuponlab.com", "", SITE), "any"); // PANEL_URL unset: no split
  assert.equal(hostRole("www.cuponlab.com", SITE, SITE), "any"); // same host: no split
  assert.equal(hostRole("www.cuponlab.com", "not a url", SITE), "any");
});

test("panelOrigin: trims and drops any path", () => {
  assert.equal(panelOrigin(" https://cms.cuponlab.com/ "), PANEL);
  assert.equal(panelOrigin(""), "");
  assert.equal(panelOrigin(undefined), "");
});

const v = (role: Parameters<typeof hostVerdict>[0], path: string, search = "") => hostVerdict(role, path, search, PANEL, SITE);

test("public host: the panel's pages move to the panel host, keeping the query", () => {
  assert.deepEqual(v("site", "/panel"), { kind: "redirect", to: `${PANEL}/panel` });
  assert.deepEqual(v("site", "/panel/coupons", "?q=nike"), { kind: "redirect", to: `${PANEL}/panel/coupons?q=nike` });
  assert.deepEqual(v("site", "/login", "?next=%2Fpanel"), { kind: "redirect", to: `${PANEL}/login?next=%2Fpanel` });
  for (const p of ["/login/magic", "/invite/abc", "/demo/medio", "/demo-preview"]) assert.equal(v("site", p).kind, "redirect", p);
  for (const p of ["/", "/chollos/1-x", "/tiendas/nike", "/entrar", "/mcp", "/llms.txt", "/robots.txt", "/p/medio/nike", "/go/medio/1", "/widget.js", "/api/telegram", "/paneles"]) {
    assert.deepEqual(v("site", p), { kind: "ok" }, p);
  }
});

test("panel host: the public site moves to its own host, / opens the panel, robots says no", () => {
  assert.deepEqual(v("panel", "/"), { kind: "redirect", to: `${PANEL}/panel` });
  assert.deepEqual(v("panel", "/chollos/1-x", "?a=1"), { kind: "redirect", to: `${SITE}/chollos/1-x?a=1` });
  assert.deepEqual(v("panel", "/mcp"), { kind: "redirect", to: `${SITE}/mcp` });
  assert.deepEqual(v("panel", "/sitemap.xml"), { kind: "redirect", to: `${SITE}/sitemap.xml` });
  assert.deepEqual(v("panel", "/robots.txt"), { kind: "robots" });
  for (const p of ["/panel", "/panel/stores/nike", "/login", "/login/restablecer", "/invite/t", "/demo/medio", "/demo-preview", "/api/export/coupons", "/api/clicks/cron", "/p/medio/nike", "/go/medio/1", "/widget.js", "/icon.svg", "/store-logo/nike"]) {
    assert.deepEqual(v("panel", p), { kind: "ok" }, p);
  }
});

test("any other host serves everything, as before", () => {
  for (const p of ["/", "/panel", "/login", "/chollos/1-x", "/robots.txt"]) assert.deepEqual(v("any", p), { kind: "ok" }, p);
});
