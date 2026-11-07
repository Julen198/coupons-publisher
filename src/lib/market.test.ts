import { test } from "node:test";
import assert from "node:assert/strict";
import { COUNTRIES, countryLabel, effectiveCountry, inferStoreCountry, isCountryCode, isSpanishMarket, onSpanishSite } from "./market.ts";

test("stores whose website is in another European market are not for the Spanish site", () => {
  for (const site of [
    "https://www.jdsports.it/",
    "www.jdsports.pt",
    "https://www.jdsports.co.uk/men",
    "https://www.bergfreunde.de",
    "https://www.bergfreunde.nl?x=1",
    "https://www.sizeofficial.fr#top",
    "http://shop.example.be:8080/",
    "https://www.example.at",
    "https://www.example.ch",
    "https://www.example.uk",
    "https://www.example.pl",
    "https://www.example.se",
    "https://www.example.dk",
    "https://www.example.fi",
    "https://www.example.ie",
    "HTTPS://WWW.FOOTLOCKER.FR",
    "https://www.example.de.",
  ]) assert.equal(isSpanishMarket(site), false, site);
});

test("Spanish and international websites stay", () => {
  for (const site of [
    "https://www.zooplus.es",
    "www.pccomponentes.com",
    "https://www.myprotein.com/fr",
    "https://www.italia.com",
    "https://edit",
    "https://www.ch.es/de",
    "",
    "   ",
  ]) assert.equal(isSpanishMarket(site), true, site);
});

test("a country-like label before .es or .com.es is not a market, a real ccTLD is", () => {
  assert.equal(isSpanishMarket("https://www.jdsports.es"), true);
  assert.equal(isSpanishMarket("https://x.com.es"), true);
  assert.equal(isSpanishMarket("https://x.co.uk"), false);
});

// ---- inferStoreCountry / onSpanishSite

const infer = (name: string, slug: string, website: string, trackingUrl?: string) => inferStoreCountry({ name, slug, website, trackingUrl })?.country ?? null;

test("the stores that leaked onto /tiendas name another country", () => {
  assert.equal(infer("Myprotein DE", "myprotein-de", "https://de.myprotein.com"), "DE");
  assert.equal(infer("Myprotein FR", "myprotein-fr", "https://fr.myprotein.com"), "FR");
  assert.equal(infer("On.com (FR)", "on-com-fr", "https://www.on.com"), "FR");
  assert.equal(infer("engelhorn DE", "engelhorn-de", "https://info.engelhorn.com"), "DE");
  assert.equal(infer("43einhalb DE", "43einhalb-de", "https://www.43einhalb.com"), "DE");
  assert.equal(infer("Foot Locker FR", "foot-locker-fr", "https://www.footlocker.fr"), "FR");
  assert.equal(infer("JD Sports UK", "jd-sports-uk", "https://www.jdsports.co.uk"), "GB");
  assert.equal(infer("JD Sports IT", "jd-sports-it", "https://www.jdsports.it"), "IT");
  assert.equal(infer("JD Sports PT", "jd-sports-pt", "https://www.jdsports.pt"), "PT");
  assert.equal(infer("Bergfreunde NL", "bergfreunde-nl", "https://www.bergfreunde.nl"), "NL");
  assert.equal(infer("Alpinetrek UK", "alpinetrek-uk", "https://www.alpinetrek.co.uk"), "GB");
});

test("Spanish stores: .es says ES, a plain .com says nothing", () => {
  assert.equal(infer("Myprotein", "myprotein", "https://www.myprotein.es"), "ES");
  assert.equal(infer("Foot Locker", "foot-locker", "https://www.footlocker.es"), "ES");
  assert.equal(infer("Zalando", "zalando", "https://www.zalando.com.es"), "ES");
  assert.equal(infer("PcComponentes", "pccomponentes", "https://www.pccomponentes.com"), null);
  assert.equal(infer("BSTN", "bstn", "https://www.bstn.com"), null);
  assert.equal(infer("43einhalb", "43einhalb", "https://www.43einhalb.com"), null);
  assert.equal(infer("engelhorn", "engelhorn", "https://info.engelhorn.com"), null);
  assert.equal(infer("Uber Eats", "uber-eats", "https://www.ubereats.com"), null);
  assert.equal(infer("Booking.com", "booking-com", "https://www.booking.com"), null);
  assert.equal(infer("Sin web", "sin-web", ""), null);
  assert.equal(infer("Adidas ES", "adidas", "https://www.adidas.com"), "ES");
  assert.equal(infer("Rituals", "rituals-es", "https://www.rituals.com"), "ES");
});

test("each signal on its own, with a reason", () => {
  assert.deepEqual(inferStoreCountry({ name: "X", slug: "x", website: "https://www.x.de" }), { country: "DE", reason: "dominio .de" });
  assert.equal(infer("X", "x", "https://www.x.com/de"), "DE");
  assert.equal(infer("X", "x", "https://www.x.com/fr-fr/sale"), "FR");
  assert.equal(infer("X", "x", "https://www.x.com/en-gb/"), "GB");
  assert.equal(infer("X", "x", "https://www.x.com/es-es/"), "ES");
  assert.equal(infer("X", "x", "https://www.x.com/ca-es"), "ES");
  assert.equal(infer("X", "x", "https://www.x.com/de_CH/"), "CH");
  assert.equal(infer("X", "x", "https://www.x.com/?country=fr"), "FR");
  assert.equal(infer("X", "x", "https://es.x.com"), "ES");
  assert.equal(infer("X", "x", "https://uk.x.com"), "GB");
  assert.equal(infer("X", "x", "https://www.x.co.uk"), "GB");
  assert.equal(infer("X", "x", "https://www.x.ch"), "CH");
  assert.equal(infer("X IT", "x", ""), "IT");
  assert.equal(infer("X (UK)", "x", ""), "GB");
  assert.equal(infer("X - DE", "x", ""), "DE");
  assert.equal(infer("X", "x-ch", ""), "CH");
  assert.equal(infer("X", "x-pt", ""), "PT");
  assert.match(inferStoreCountry({ name: "Myprotein FR", slug: "m", website: "" })!.reason, /nombre/);
  assert.match(inferStoreCountry({ name: "M", slug: "m-fr", website: "" })!.reason, /slug/);
});

test("name, slug and path beat a generic .com; a ccTLD beats the path", () => {
  assert.equal(infer("Myprotein FR", "myprotein-fr", "https://www.myprotein.com/es"), "FR");
  assert.equal(infer("X", "x-de", "https://www.x.com/es"), "DE");
  assert.equal(infer("X", "x", "https://www.ch.es/de"), "ES");
});

test("words that look like codes but are not a market say nothing", () => {
  assert.equal(infer("Just do it", "just-do-it", "https://www.nike.com"), null);
  assert.equal(infer("Casa de", "casa", "https://www.casa.com/en/"), null);
  assert.equal(infer("X", "x", "https://ca.x.com/ca/"), null);
  assert.equal(infer("X", "x", "https://www.x.com/products/de"), null);
  assert.equal(infer("X", "x", "https://www.x.eu"), null);
  assert.equal(infer("Info", "info", "https://info.x.com"), null);
  assert.equal(infer("X", "x", "https://www.x.com/de-x"), null);
});

test("a tracking link carrying a fixed destination counts last", () => {
  assert.equal(infer("X", "x", "", "https://track.example.com/c?id=1&url=https%3A%2F%2Fwww.x.fr%2F"), "FR");
  assert.equal(infer("X", "x", "", "https://track.example.com/c?id=1&url={url}"), null);
  assert.equal(infer("X", "x", "https://www.x.es", "https://t.com/?url=https%3A%2F%2Fwww.x.fr"), "ES");
});

test("onSpanishSite: stored ES wins, another stored or inferred country is out, else the TLD rule", () => {
  const s = (name: string, slug: string, website: string, country?: string) => ({ name, slug, website, country });
  assert.equal(onSpanishSite(s("JD Sports", "jd-sports", "https://www.jdsports.it", "ES")), true);
  assert.equal(onSpanishSite(s("PcComponentes", "pccomponentes", "https://www.pccomponentes.com", "FR")), false);
  assert.equal(onSpanishSite(s("PcComponentes", "pccomponentes", "https://www.pccomponentes.com", "")), true);
  assert.equal(onSpanishSite(s("PcComponentes", "pccomponentes", "https://www.pccomponentes.com")), true);
  assert.equal(onSpanishSite(s("Myprotein DE", "myprotein-de", "https://de.myprotein.com", "")), false);
  assert.equal(onSpanishSite(s("On.com (FR)", "on-com-fr", "https://www.on.com")), false);
  assert.equal(onSpanishSite(s("Myprotein", "myprotein", "https://www.myprotein.es")), true);
  assert.equal(onSpanishSite(s("JD Sports", "jd-sports", "https://www.jdsports.it")), false);
  assert.equal(onSpanishSite(s("Adidas ES", "adidas", "https://www.adidas.de")), false, "ES by name, but the TLD rule still applies");
  assert.equal(onSpanishSite(s("X", "x", "", "es")), true, "stored code in lower case");
});

test("effectiveCountry: stored first, then inferred, else none", () => {
  assert.deepEqual(effectiveCountry({ name: "X", slug: "x", website: "https://x.de", country: "ES" }), { country: "ES", inferred: false, reason: "" });
  assert.deepEqual(effectiveCountry({ name: "X", slug: "x", website: "https://x.de", country: "" }), { country: "DE", inferred: true, reason: "dominio .de" });
  assert.deepEqual(effectiveCountry({ name: "X", slug: "x", website: "https://x.com" }), { country: "", inferred: false, reason: "" });
});

test("the country list: España first, then by Spanish name; codes are checked against it", () => {
  assert.equal(COUNTRIES[0].code, "ES");
  const rest = COUNTRIES.slice(1).map((c) => c.label);
  assert.deepEqual(rest, [...rest].sort((a, b) => a.localeCompare(b, "es")));
  assert.ok(COUNTRIES.some((c) => c.code === "GB" && c.label === "Reino Unido"));
  assert.equal(isCountryCode("FR"), true);
  assert.equal(isCountryCode("fr"), false);
  assert.equal(isCountryCode("XX"), false);
  assert.equal(isCountryCode(""), false);
  assert.equal(countryLabel("DE"), "Alemania");
  assert.equal(countryLabel("AU"), "AU");
  assert.equal(countryLabel(""), "Sin definir");
});
