import { test } from "node:test";
import assert from "node:assert/strict";
import { countryCode, networkCountries, singleCountry } from "./types.ts";
import { mapProgramme } from "./awin.ts";
import { advertiserCountry } from "./cj.ts";

test("countryCode / singleCountry: one ISO alpha-2 country or nothing", () => {
  assert.equal(countryCode(" de "), "DE");
  assert.equal(countryCode("UK"), "GB");
  assert.equal(countryCode("Germany"), "");
  assert.equal(countryCode(undefined), "");
  assert.equal(singleCountry(["ES"]), "ES");
  assert.equal(singleCountry(["es", "ES"]), "ES");
  assert.equal(singleCountry(["ES", "PT"]), "");
  assert.equal(singleCountry([]), "");
});

test("Awin: the programme's primary region is the store's country", () => {
  const p = { id: 1, name: "Myprotein DE", displayUrl: "de.myprotein.com" };
  assert.equal(mapProgramme({ ...p, primaryRegion: { name: "Germany", countryCode: "DE" } }).country, "DE");
  assert.equal(mapProgramme(p).country, undefined, "no region, no country key (adapters' deepEqual stays)");
  assert.equal(mapProgramme({ ...p, primaryRegion: { name: "?" } }).country, undefined);
});

test("CJ: an advertiser whose every link targets the same single country", () => {
  const l = (countries: string) => ({ countries });
  assert.equal(advertiserCountry([l("FR"), l("fr")]), "FR");
  assert.equal(advertiserCountry([l("ES, PT")]), "");
  assert.equal(advertiserCountry([l("ES"), l("")]), "", "a link for everywhere says nothing");
  assert.equal(advertiserCountry([l("ES"), l("FR")]), "");
  assert.equal(advertiserCountry([]), "");
});

test("networkCountries: store id → country for advertisers that name one", () => {
  const storeOf = new Map([["a", 1], ["b", 2], ["c", 3]]);
  const advs = [
    { id: "a", name: "A", website: "", trackingTemplate: "", country: "DE" },
    { id: "b", name: "B", website: "", trackingTemplate: "" },
    { id: "c", name: "C", website: "", trackingTemplate: "", country: "nope" },
    { id: "z", name: "Z", website: "", trackingTemplate: "", country: "FR" },
  ];
  assert.deepEqual([...networkCountries(advs, storeOf)], [[1, "DE"]]);
});
