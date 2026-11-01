import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanAdvertiserName, matchStore, type StoreRef } from "./match.ts";

const adv = { id: "77008", name: "adidas ES", website: "https://www.adidas.es", trackingTemplate: "" };
const store = (o: Partial<StoreRef>): StoreRef => ({ id: 1, slug: "adidas", website: "https://adidas.es/", network: "awin", merchant_id: "", tracking_url: "", ...o });

test("advertiser id in the same network wins", () => {
  assert.equal(matchStore("awin", adv, [store({ id: 2, slug: "x", website: "https://x.com", merchant_id: "77008" })]).kind, "linked");
});

test("same domain (ignoring www) or same name claims an untied store", () => {
  assert.equal(matchStore("awin", adv, [store({})]).kind, "claim");
  assert.equal(matchStore("admitad", { ...adv, website: "" }, [store({ website: "https://other.es" })]).kind, "claim");
});

test("a store already tracked through another network or advertiser is left alone", () => {
  assert.equal(matchStore("admitad", adv, [store({ merchant_id: "1" })]).kind, "other-network");
  assert.equal(matchStore("admitad", adv, [store({ network: "webgains", tracking_url: "https://t/{url}" })]).kind, "other-network");
  assert.equal(matchStore("awin", { ...adv, website: "https://nike.es", name: "Nike" }, [store({})]).kind, "none");
});

test("country suffixes come off advertiser names", () => {
  assert.equal(cleanAdvertiserName("Zalando - España"), "Zalando");
  assert.equal(cleanAdvertiserName("PcComponentes (ES)"), "PcComponentes");
  assert.equal(cleanAdvertiserName("ES"), "ES");
});
