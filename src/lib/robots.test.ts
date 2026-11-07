import assert from "node:assert/strict";
import { test } from "node:test";
import { robotsTxt } from "./robots.ts";

// Google-style matching: the longest matching rule wins, Allow wins a tie; "$" anchors the end
function allowed(txt: string, path: string): boolean {
  const rules = txt
    .split("\n")
    .map((l) => /^(Allow|Disallow): (.+)$/.exec(l))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ allow: m[1] === "Allow", pattern: m[2] }));
  const hits = rules.filter(({ pattern }) => (pattern.endsWith("$") ? path === pattern.slice(0, -1) : path.startsWith(pattern)));
  if (!hits.length) return true;
  hits.sort((a, b) => b.pattern.length - a.pattern.length || Number(b.allow) - Number(a.allow));
  return hits[0].allow;
}

const txt = robotsTxt("https://cuponlab.es");

test("robotsTxt: every page the sitemap lists, and what those pages load, is crawlable", () => {
  for (const p of ["/", "/tiendas", "/tiendas/nike", "/calendario", "/metodologia", "/aviso-de-afiliacion", "/contacto", "/chollos/42-15-extra", "/chollos/42-x/opengraph-image", "/_next/static/chunks/a.js", "/_next/image?url=x", "/store-logo/nike", "/icon.svg", "/sitemap.xml"]) {
    assert.equal(allowed(txt, p), true, p);
  }
});

test("robotsTxt: the panel, APIs, redirects, reader flows and clients' pages stay out", () => {
  for (const p of ["/panel", "/panel/coupons", "/api/telegram", "/go/cuponlab/42", "/entrar", "/entrar/confirmar", "/compartir", "/cuenta", "/login", "/invite/abc", "/p/client/store", "/demo", "/widget.js", "/no-encontrado"]) {
    assert.equal(allowed(txt, p), false, p);
  }
});

test("robotsTxt: points at the sitemap", () => {
  assert.match(txt, /^User-agent: \*$/m);
  assert.match(txt, /^Sitemap: https:\/\/cuponlab\.es\/sitemap\.xml$/m);
});
