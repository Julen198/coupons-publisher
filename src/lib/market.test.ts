import { test } from "node:test";
import assert from "node:assert/strict";
import { isSpanishMarket } from "./market.ts";

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
