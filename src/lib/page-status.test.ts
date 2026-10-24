import { test } from "node:test";
import assert from "node:assert/strict";
import { coverageOf } from "./page-status.ts";

const NOW = new Date(2026, 9, 23);
const page = (status: "draft" | "published", delivery: "html" | "widget", published_at: Date | null) => ({ status, delivery, published_at });

test("no page / draft", () => {
  assert.equal(coverageOf(undefined, NOW), "none");
  assert.equal(coverageOf(page("draft", "widget", null), NOW), "draft");
  assert.equal(coverageOf(page("published", "html", null), NOW), "draft");
});

test("hosted pages never go stale", () => {
  assert.equal(coverageOf(page("published", "widget", new Date(2025, 0, 1)), NOW), "live");
  assert.equal(coverageOf(page("published", "widget", new Date(2025, 0, 1)), NOW), "live");
});

test("HTML export is stale after its month", () => {
  assert.equal(coverageOf(page("published", "html", new Date(2026, 9, 1)), NOW), "live");
  assert.equal(coverageOf(page("published", "html", new Date(2026, 8, 30)), NOW), "stale");
  assert.equal(coverageOf(page("published", "html", new Date(2025, 9, 23)), NOW), "stale");
});
