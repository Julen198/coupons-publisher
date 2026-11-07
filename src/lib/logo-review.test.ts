import { test } from "node:test";
import assert from "node:assert/strict";
import { logoDataInfo, parseRefreshArgs, renderLogoReview } from "./logo-review.ts";

const png = (w: number) => {
  const b = Buffer.alloc(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(w, 20);
  return `data:image/png;base64,${b.toString("base64")}`;
};

test("logoDataInfo reads a stored data: URI's real type and size; null for empty or odd values", () => {
  assert.deepEqual(logoDataInfo(png(16)), { type: "image/png", width: 16, height: 16, bytes: 33 });
  const ico = `data:image/x-icon;base64,${Buffer.from([0, 0, 1, 0, 1, 0, 48, 48, ...Array(30).fill(0)]).toString("base64")}`;
  assert.deepEqual(logoDataInfo(ico), { type: "image/x-icon", width: 48, height: 48, bytes: 38 });
  assert.equal(logoDataInfo(""), null);
  assert.equal(logoDataInfo(`data:text/html;base64,${Buffer.from("<b>").toString("base64")}`), null);
  assert.equal(logoDataInfo(`data:image/png;base64,"><script>`), null);
});

test("parseRefreshArgs: dry run by default, --apply, --only list, --force and --from need --only", () => {
  assert.deepEqual(parseRefreshArgs([]), { apply: false, only: [], force: false, from: "", file: "", out: "", clear: false, wordmarks: false });
  assert.deepEqual(parseRefreshArgs(["--apply", "--only=a, b", "--out=/tmp/x.html"]), { apply: true, only: ["a", "b"], force: false, from: "", file: "", out: "/tmp/x.html", clear: false, wordmarks: false });
  assert.deepEqual(parseRefreshArgs(["--only=eci", "--force", "--from=https://x.es/l.svg"]).from, "https://x.es/l.svg");
  assert.throws(() => parseRefreshArgs(["--force"]), /--only/);
  assert.throws(() => parseRefreshArgs(["--from=https://x.es/l.png", "--only=a,b"]), /one store/);
  assert.throws(() => parseRefreshArgs(["--aply"]), /--aply/);
  // --clear removes the stored logo (the site then shows the store's initials); only for named stores
  assert.equal(parseRefreshArgs(["--clear", "--only=el-corte-ingles,rituals"]).clear, true);
  assert.throws(() => parseRefreshArgs(["--clear"]), /--only/);
  // --file: a logo file downloaded by hand (sites that block bots), for one store
  assert.equal(parseRefreshArgs(["--only=el-corte-ingles", "--file=~/Downloads/eci.png"]).file, "~/Downloads/eci.png");
  assert.throws(() => parseRefreshArgs(["--file=x.png", "--only=a,b"]), /one store/);
});

test("renderLogoReview escapes store text and only embeds image data URIs", () => {
  const html = renderLogoReview(
    [
      {
        name: `<b>Shop</b> & "Co"`,
        slug: "shop",
        current: { dataUri: png(16), info: { type: "image/png", width: 16, height: 16, bytes: 33 } },
        proposed: { dataUri: png(512), source: "manifest", url: "https://shop.es/a.png?x=<y>", width: 512, height: 512, type: "image/png", bytes: 33 },
        willUpdate: true,
        tried: [{ url: "https://shop.es/", source: "icon", result: "HTTP <403>" }],
      },
      { name: "Bad", slug: "bad", current: { dataUri: `data:text/html,<script>alert(1)</script>`, info: null }, proposed: null, willUpdate: false, tried: [] },
    ],
    { apply: false, generatedAt: "2026-11-07" },
  );
  assert.match(html, /&lt;b&gt;Shop&lt;\/b&gt; &amp; &quot;Co&quot;/);
  assert.match(html, /a\.png\?x=&lt;y&gt;/);
  assert.match(html, /HTTP &lt;403&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /512×512/);
  assert.equal((html.match(/src="data:image\/png;base64,/g) ?? []).length, 4); // current + proposed, at 112 and 16
});

test("parseRefreshArgs: --wordmarks works with the same options", () => {
  assert.equal(parseRefreshArgs(["--wordmarks"]).wordmarks, true);
  const one = parseRefreshArgs(["--wordmarks", "--only=eci", "--from=https://upload.wikimedia.org/x.svg", "--apply"]);
  assert.deepEqual([one.wordmarks, one.apply, one.from], [true, true, "https://upload.wikimedia.org/x.svg"]);
  assert.equal(parseRefreshArgs(["--wordmarks", "--clear", "--only=eci"]).clear, true);
});

test("renderLogoReview in wordmark mode shows each one in the 120×50 card box and the 240×100 hero box", () => {
  const html = renderLogoReview(
    [{ name: "Shop", slug: "shop", current: { dataUri: "", info: null }, proposed: { dataUri: png(512), source: "header", url: "https://shop.es/l.png", width: 512, height: 512, type: "image/png", bytes: 33 }, willUpdate: true, tried: [] }],
    { apply: false, generatedAt: "2026-11-07", kind: "wordmark" },
  );
  assert.match(html, /Revisión de wordmarks/);
  assert.match(html, /class="wm card"/);
  assert.match(html, /class="wm hero"/);
  assert.equal((html.match(/src="data:image\/png;base64,/g) ?? []).length, 2);
});
