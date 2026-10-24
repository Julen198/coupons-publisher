import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanDisguise, darkSvgDataUri, decodeHtml, extractDisguise, isSvgUrl, isWhiteSvg, siteDigest, validLogo } from "./disguise.ts";

const html = `<html><head>
<title>El Norte Digital - Noticias de última hora</title>
<meta property="og:site_name" content="El Norte Digital">
<meta name="theme-color" content="#B42318">
<link rel="apple-touch-icon" href="/icon-180.png">
</head><body>
<header><a href="/"><img class="site-logo" src="/img/logo.svg" alt="El Norte"></a></header>
<nav><a href="/">Portada</a><a href="/espana">España</a><a href="/deportes"><span>Deportes</span></a>
<a href="/x">X</a><a href="/eco">Economía &amp; Empresas</a><a href="/espana">España</a></nav>
</body></html>`;

test("extracts name, logo, color and nav from a homepage", () => {
  assert.deepEqual(extractDisguise(html, "https://www.elnorte.es/"), {
    name: "El Norte Digital",
    logoUrl: "https://www.elnorte.es/img/logo.svg",
    color: "#b42318",
    nav: ["Portada", "España", "Deportes", "Economía & Empresas"],
  });
});

test("falls back to title, apple-touch-icon and short hex", () => {
  const d = extractDisguise(
    `<title>Revista Urbana | Inicio</title><meta name="theme-color" content="#5b3"><link rel="apple-touch-icon" href="https://cdn.ru.com/i.png">`,
    "https://ru.com",
  );
  assert.deepEqual(d, { name: "Revista Urbana", logoUrl: "https://cdn.ru.com/i.png", color: "#55bb33", nav: undefined });
});

test("strips tagline and www. from og:site_name", () => {
  const d = extractDisguise(`<meta property="og:site_name" content="www.20minutos.es - Últimas Noticia"/>`, "https://www.20minutos.es/");
  assert.equal(d.name, "20minutos.es");
});

test("ignores javascript: and data: logos and bad colors", () => {
  const d = extractDisguise(`<img class="logo" src="javascript:alert(1)"><meta name="theme-color" content="red">`, "https://a.es");
  assert.equal(d.logoUrl, undefined);
  assert.equal(d.color, undefined);
});

test("siteDigest lists logo candidates, menu links, brand-ish colours and fonts for the model", () => {
  const page = `<title>Tienda X</title><meta name="theme-color" content="#ffffff">
<style>:root{--brand-primary:#00843D}.btn{background:#00843d;color:#fff}a{color:#00843d}body{font-family:"Helvetica Neue",Arial,sans-serif}</style>
<header><img class="logo-main" src="/logo.svg" alt="Tienda X"><nav><a href="/m">Moda</a><a href="/h">Hogar</a></nav></header>`;
  const { text, logos } = siteDigest(page, "https://x.es/");
  assert.deepEqual(logos, ["https://x.es/logo.svg"]);
  assert.match(text, /#00843d ×3/);
  assert.doesNotMatch(text, /#ffffff ×/); // greys/white are noise, not brand colours
  assert.match(text, /Moda \| Hogar/);
  assert.match(text, /Helvetica Neue/);
});

test("cleanDisguise trusts the model only within safe bounds", () => {
  const fallback = { name: "Regex", color: "#b42318", nav: ["Portada"] };
  const d = cleanDisguise(
    { name: " Tienda X ", logoUrl: "https://evil.example/made-up.png", color: "#FFFFFF", nav: ["Moda", "", "x".repeat(40)], font: "sans" },
    fallback,
    ["https://x.es/logo.svg"],
  );
  assert.deepEqual(d, { name: "Tienda X", logoUrl: undefined, color: "#b42318", nav: ["Moda"], font: "sans", fontFamily: undefined, layout: undefined });
  assert.equal(cleanDisguise({ logoUrl: "https://x.es/logo.svg", color: "#00843D" }, {}, ["https://x.es/logo.svg"]).logoUrl, "https://x.es/logo.svg");
  assert.equal(cleanDisguise({ color: "#00843D" }, {}, []).color, "#00843d");
});

test("keeps accents: named/numeric entities and non-UTF-8 pages", () => {
  const d = extractDisguise(`<nav><a>F&uacute;tbol</a><a>Espa&ntilde;a</a><a>&#193;frica</a><a>Opini&#xF3;n</a></nav>`, "https://m.es/");
  assert.deepEqual(d.nav, ["Fútbol", "España", "África", "Opinión"]);
  const latin = new Uint8Array([...Buffer.from("<title>Espa"), 0xf1, ...Buffer.from("a</title>")]);
  assert.equal(decodeHtml(latin.buffer, "text/html; charset=iso-8859-15"), "<title>España</title>");
  assert.equal(decodeHtml(latin.buffer, null).includes("�"), true); // no charset given: UTF-8, like browsers
  const meta = new Uint8Array([...Buffer.from('<meta charset="iso-8859-1"><b>'), 0xf1, ...Buffer.from("</b>")]);
  assert.match(decodeHtml(meta.buffer, "text/html"), /<b>ñ<\/b>/);
});

test("siteDigest ignores logo-ish images outside the header", () => {
  const { logos } = siteDigest(
    `<header><svg class="logo"></svg><img src="/logos/club.png" width="30" alt="Escudo"></header><main><img class="team-logo" src="/club.png" alt="Escudo"></main><link rel="apple-touch-icon" href="/icon.png">`,
    "https://m.es/",
  );
  assert.deepEqual(logos, ["https://m.es/icon.png"]);
});

test("siteDigest reads external CSS, brand-named images, og:image and a header search box", () => {
  const page = `<meta property="og:site_name" content="El Corte Inglés"><meta property="og:image" content="/letras.png">
<header><a aria-label="Logo"><svg></svg></a><input type="search" placeholder="¿Qué estás buscando?"></header>
<footer><img class="footer-brand-logo" src="/eci.svg" alt="El Corte Inglés" width="1840"><img src="/promo.jpg" alt="Catálogos"></footer>`;
  const css = `.btn{background:#00A650}.x{color:#00a650}h1{font-family:Montserrat,sans-serif}`;
  const { text, logos } = siteDigest(page, "https://eci.es/", css);
  assert.deepEqual(logos, ["https://eci.es/eci.svg", "https://eci.es/letras.png"]);
  assert.match(text, /#00a650 ×2/);
  assert.match(text, /Montserrat/);
  assert.match(text, /Buscador en la cabecera: sí/);
});

test("cleanDisguise keeps a known layout and a plain font family name", () => {
  const d = cleanDisguise({ layout: "store", fontFamily: " Montserrat " }, {}, []);
  assert.equal(d.layout, "store");
  assert.equal(d.fontFamily, "Montserrat");
  const bad = cleanDisguise({ layout: "weird" as never, fontFamily: "x'};@import url(evil)" }, { layout: "newspaper" }, []);
  assert.equal(bad.layout, "newspaper");
  assert.equal(bad.fontFamily, undefined);
});

test("siteDigest skips promo photos that merely mention the brand", () => {
  const { logos } = siteDigest(
    `<meta property="og:site_name" content="El Corte Inglés"><img src="/viajes.jpeg" alt="Viajes El Corte Inglés"><img src="/plus.png" alt="El Corte Inglés Plus"><img src="/eci.svg" alt="El Corte Inglés">`,
    "https://eci.es/",
  );
  assert.deepEqual(logos, ["https://eci.es/eci.svg"]);
});

test("white footer wordmarks are spotted and repainted dark", () => {
  const eci = `<svg fill="none"><path d="M0" fill="white" fill-opacity="0.25"/><path style="fill:#FFF"/></svg>`;
  assert.equal(isWhiteSvg(eci), true);
  assert.equal(isWhiteSvg(`<svg><path fill="white"/><path fill="#1a1a1a"/></svg>`), false);
  assert.equal(isWhiteSvg(`<svg><path d="M0"/></svg>`), false); // default fill is black
  const uri = darkSvgDataUri(eci);
  const svg = Buffer.from(uri.split(",")[1], "base64").toString();
  assert.equal(svg, `<svg fill="none"><path d="M0" fill="#1a1a1a"/><path style="fill:#1a1a1a"/></svg>`);
  assert.equal(validLogo(uri), true);
  assert.equal(validLogo("https://x.es/l.png"), true);
  assert.equal(validLogo("data:text/html;base64,PHNjcmlwdD4="), false);
  assert.equal(validLogo("javascript:alert(1)"), false);
  assert.equal(isSvgUrl("https://x.es/logo.svg?v=2"), true);
});
