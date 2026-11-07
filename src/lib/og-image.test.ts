import { test } from "node:test";
import assert from "node:assert/strict";
import { extractOgImage, isBlockedAddress, isProductImage, isTrackingLink } from "./og-image.ts";

const coffeeMachine = `<!doctype html><html lang="es"><head>
<meta charset="utf-8">
<title>Cafetera superautomática De'Longhi Magnifica S ECAM22.110.B | Tienda</title>
<meta property="og:type" content="product">
<meta property="og:title" content="Cafetera superautomática De&#39;Longhi Magnifica S">
<meta content="https://cdn.tienda.es/media/catalog/ecam22-110-b_1200x1200.jpg?v=3&amp;w=1200" property="og:image">
<meta property="og:image:width" content="1200">
<meta name="twitter:image" content="https://cdn.tienda.es/media/twitter-card.jpg">
</head><body><img src="/logo.png"></body></html>`;

const PRODUCT = "https://www.tienda.es/cafeteras/delonghi-magnifica-s-ecam22-110-b";

test("extractOgImage reads og:image and og:type, decoding entities, attributes in any order", () => {
  assert.deepEqual(extractOgImage(coffeeMachine, PRODUCT), {
    image: "https://cdn.tienda.es/media/catalog/ecam22-110-b_1200x1200.jpg?v=3&w=1200",
    type: "product",
  });
});

test("extractOgImage resolves a relative og:image against the page", () => {
  const html = `<head><meta property='og:image' content='/img/p/zapatilla-azul.webp'><meta property="og:type" content="og:product"></head>`;
  assert.deepEqual(extractOgImage(html, "https://shop.es/es/zapatillas/azul-42"), { image: "https://shop.es/img/p/zapatilla-azul.webp", type: "og:product" });
  const protoRelative = `<meta property="og:image" content="//cdn.shop.es/a.jpg">`;
  assert.equal(extractOgImage(protoRelative, "https://shop.es/p/1")?.image, "https://cdn.shop.es/a.jpg");
});

test("extractOgImage rejects http images, but takes an https secure_url or twitter:image instead", () => {
  assert.equal(extractOgImage(`<meta property="og:image" content="http://shop.es/a.jpg">`, "https://shop.es/p/1"), null);
  const withSecure = `<meta property="og:image" content="http://shop.es/a.jpg"><meta property="og:image:secure_url" content="https://shop.es/a.jpg">`;
  assert.equal(extractOgImage(withSecure, "https://shop.es/p/1")?.image, "https://shop.es/a.jpg");
  const twitterOnly = `<meta name="twitter:image" content="https://shop.es/tw.jpg">`;
  assert.deepEqual(extractOgImage(twitterOnly, "https://shop.es/p/1"), { image: "https://shop.es/tw.jpg", type: "" });
});

test("extractOgImage returns null when there are no image tags, or they are empty or broken", () => {
  assert.equal(extractOgImage("<html><head><title>Hola</title></head></html>", "https://shop.es/p/1"), null);
  assert.equal(extractOgImage(`<meta property="og:image" content="">`, "https://shop.es/p/1"), null);
  assert.equal(extractOgImage(`<meta property="og:image" content="javascript:alert(1)">`, "https://shop.es/p/1"), null);
  assert.equal(extractOgImage(`<meta property="og:image" content="data:image/png;base64,AAAA">`, "https://shop.es/p/1"), null);
});

test("isProductImage: og:type product counts even on a listing path", () => {
  const img = "https://cdn.tienda.es/media/catalog/ecam22.jpg";
  for (const type of ["product", "og:product", "product.item", "Product"]) {
    assert.equal(isProductImage({ image: img, type }, "https://www.tienda.es/categoria/cafeteras", null), true, type);
  }
});

test("isProductImage: the home page, or a page reusing the home image, is not a product", () => {
  const home = "https://www.tienda.es/share/home-1200.jpg";
  assert.equal(isProductImage({ image: home, type: "website" }, "https://www.tienda.es/", home), false);
  assert.equal(isProductImage({ image: "https://www.tienda.es/x.jpg", type: "website" }, "https://www.tienda.es", null), false);
  assert.equal(isProductImage({ image: home, type: "website" }, "https://www.tienda.es/cafeteras/magnifica-s", home), false);
  assert.equal(isProductImage({ image: "https://www.tienda.es/p/magnifica.jpg", type: "website" }, "https://www.tienda.es/cafeteras/magnifica-s", home), true);
});

test("isProductImage: listing pages need og:type product", () => {
  const img = { image: "https://www.tienda.es/cat/cafeteras.jpg", type: "website" };
  for (const path of ["/categoria/cafeteras", "/c/electro", "/collections/verano", "/ofertas", "/buscar?q=cafetera", "/es/rebajas/", "/search?q=x", "/outlet/hombre"]) {
    assert.equal(isProductImage(img, `https://www.tienda.es${path}`, "https://www.tienda.es/home.jpg"), false, path);
  }
});

test("isProductImage rejects logos, sprites, placeholders, banners and SVGs whatever og:type says", () => {
  const landing = "https://www.tienda.es/cafeteras/magnifica-s";
  for (const image of [
    "https://www.tienda.es/static/logo.png",
    "https://www.tienda.es/img/Tienda-Logo-OG.jpg",
    "https://www.tienda.es/img/sprite@2x.png",
    "https://www.tienda.es/img/placeholder.jpg",
    "https://www.tienda.es/img/default-share.jpg",
    "https://www.tienda.es/img/banner-verano.jpg",
    "https://www.tienda.es/img/producto.svg",
    "https://www.tienda.es/img/producto.SVG?v=2",
  ]) {
    assert.equal(isProductImage({ image, type: "product" }, landing, null), false, image);
  }
  // "logo" in a folder name is fine: only the file name counts
  assert.equal(isProductImage({ image: "https://www.tienda.es/logos-brand/magnifica.jpg", type: "product" }, landing, null), true);
});

test("isBlockedAddress blocks private, loopback, link-local and metadata addresses", () => {
  for (const ip of ["10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.1.1", "127.0.0.1", "169.254.169.254", "0.0.0.0", "100.100.100.200", "224.0.0.1", "::1", "::", "fc00::1", "fd00:ec2::254", "fe80::1", "::ffff:127.0.0.1", "::ffff:a9fe:a9fe"]) {
    assert.equal(isBlockedAddress(ip), true, ip);
  }
  for (const ip of ["8.8.8.8", "172.32.0.1", "151.101.1.1", "2a00:1450:4003:80b::2004"]) {
    assert.equal(isBlockedAddress(ip), false, ip);
  }
  assert.equal(isBlockedAddress("not-an-ip"), true);
});

test("isTrackingLink spots affiliate redirects, which must not be fetched (they would count a click)", () => {
  assert.equal(isTrackingLink("https://www.awin1.com/cread.php?awinmid=1&awinaffid=2"), true);
  assert.equal(isTrackingLink("https://track.effiliation.com/servlet/effi.redir?id_compteur=1"), true);
  assert.equal(isTrackingLink("https://clk.tradedoubler.com/click?p=1"), true);
  assert.equal(isTrackingLink("https://www.anrdoezrs.net/click-1-2"), true);
  assert.equal(isTrackingLink("https://www.tienda.es/cafeteras/magnifica-s"), false);
});

test("isBlockedAddress blocks IPv6 forms that embed an IPv4 address: IPv4-compatible, 6to4 and Teredo", () => {
  for (const ip of ["::7f00:1", "::127.0.0.1", "::a9fe:a9fe", "::10.0.0.1", "2002:7f00:1::", "2002:c0a8:101::1", "2002:808:808::1", "2001:0:4136:e378:8000:63bf:3fff:fdd2", "2001::1"]) {
    assert.equal(isBlockedAddress(ip), true, ip);
  }
  for (const ip of ["2001:4860:4860::8888", "2606:4700:4700::1111", "2003::1"]) {
    assert.equal(isBlockedAddress(ip), false, ip);
  }
});
