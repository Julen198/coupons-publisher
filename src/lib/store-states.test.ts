import { test } from "node:test";
import assert from "node:assert/strict";
import { bulkTargets, canServePage, nextStatus, stateOf, type StoreRow } from "./store-states.ts";

test("stateOf: a client's store is new until someone decides; then active, inactive or blocked", () => {
  assert.equal(stateOf(undefined), "new");
  assert.equal(stateOf("published"), "active");
  assert.equal(stateOf("draft"), "inactive");
  assert.equal(stateOf("blocked"), "blocked");
});

test("nextStatus: what each button stores; a blocked store can't be activated without unblocking first", () => {
  assert.equal(nextStatus("new", "activate"), "published");
  assert.equal(nextStatus("inactive", "activate"), "published");
  assert.equal(nextStatus("active", "deactivate"), "draft");
  assert.equal(nextStatus("new", "deactivate"), "draft"); // reviewed, kept off: no longer "Nueva"
  assert.equal(nextStatus("active", "block"), "blocked"); // a competitor found later comes off at once
  assert.equal(nextStatus("blocked", "unblock"), "draft"); // unblocking never publishes by itself
  assert.equal(nextStatus("blocked", "activate"), null);
  assert.equal(nextStatus("blocked", "deactivate"), null);
  assert.equal(nextStatus("active", "unblock"), null);
});

const row = (slug: string, state: StoreRow["state"], live: number): StoreRow => ({ storeId: slug.length, slug, state, live });

test("bulkTargets: «Activar todas» skips blocked stores and stores with nothing live; «Desactivar todas» touches only active ones", () => {
  const rows = [row("amazon", "blocked", 30), row("kiwoko", "new", 7), row("aosom", "inactive", 5), row("vacia", "new", 0), row("nike", "active", 6)];
  assert.deepEqual(bulkTargets(rows, "activate").map((r) => r.slug), ["kiwoko", "aosom"]);
  assert.deepEqual(bulkTargets(rows, "deactivate").map((r) => r.slug), ["nike"]);
  // «Marcar nuevas como revisadas»: every new store, with or without coupons, stays off but loses the «Nueva» tag
  assert.deepEqual(bulkTargets(rows, "review").map((r) => r.slug), ["kiwoko", "vacia"]);
});

test("canServePage: the public widget page exists only when active; panel users can preview the rest", () => {
  assert.equal(canServePage("published", false), true);
  assert.equal(canServePage("draft", false), false);
  assert.equal(canServePage("blocked", false), false);
  assert.equal(canServePage(undefined, false), false);
  assert.equal(canServePage("draft", true), true); // the generator's preview
  assert.equal(canServePage("blocked", true), true);
});
