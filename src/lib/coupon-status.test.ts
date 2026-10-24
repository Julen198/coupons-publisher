import { test } from "node:test";
import assert from "node:assert/strict";
import { daysUntil, expiresSoon, isPublic, matchesFilter, statusOf, today } from "./coupon-status.ts";

const T = "2026-10-23";
const c = (verified: number, expires_at = "", archived = 0) => ({ verified, expires_at, archived });

test("statusOf: archived > expired > verified/pending", () => {
  assert.equal(statusOf(c(1, "2026-10-22", 1), T), "archived");
  assert.equal(statusOf(c(1, "2026-10-22"), T), "expired");
  assert.equal(statusOf(c(1, "2026-10-23"), T), "ok"); // expires today = still valid
  assert.equal(statusOf(c(0), T), "pending");
});

test("expiresSoon within 7 days, not expired or undated", () => {
  assert.equal(expiresSoon(c(1, "2026-10-30"), T), true);
  assert.equal(expiresSoon(c(1, "2026-10-31"), T), false);
  assert.equal(expiresSoon(c(1, "2026-10-22"), T), false);
  assert.equal(expiresSoon(c(1), T), false);
});

test("matchesFilter: 'all' hides archived", () => {
  assert.equal(matchesFilter(c(1, "", 1), "all", T), false);
  assert.equal(matchesFilter(c(1, "", 1), "archived", T), true);
  assert.equal(matchesFilter(c(0), "pending", T), true);
  assert.equal(matchesFilter(c(0, "2026-10-25"), "soon", T), true);
});

test("isPublic excludes expired and archived", () => {
  assert.equal(isPublic(c(0), T), true);
  assert.equal(isPublic(c(1, "2026-10-01"), T), false);
  assert.equal(isPublic(c(1, "", 1), T), false);
});

test("today formats YYYY-MM-DD and daysUntil counts days", () => {
  assert.equal(today(new Date(2026, 0, 5)), "2026-01-05");
  assert.equal(daysUntil("2026-11-02", T), 10);
});

test("coupons found on the web stay off public pages until someone verifies them", () => {
  const t = "2026-10-24";
  assert.equal(isPublic({ verified: 0, archived: 0, expires_at: "", source: "web" }, t), false);
  assert.equal(isPublic({ verified: 1, archived: 0, expires_at: "", source: "web" }, t), true);
  assert.equal(isPublic({ verified: 0, archived: 0, expires_at: "", source: "manual" }, t), true);
});

test("demo mode can publish unverified web finds (never expired or archived ones)", () => {
  const t = "2026-10-24";
  assert.equal(isPublic({ verified: 0, archived: 0, expires_at: "", source: "web" }, t, true), true);
  assert.equal(isPublic({ verified: 0, archived: 1, expires_at: "", source: "web" }, t, true), false);
  assert.equal(isPublic({ verified: 0, archived: 0, expires_at: "2026-01-01", source: "web" }, t, true), false);
});
