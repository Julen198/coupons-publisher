import { test } from "node:test";
import assert from "node:assert/strict";
import { awinWindows, parseAwinTransactions, parseClickref } from "./commissions-parse.ts";

const CLIENTS = ["cuponlab", "el-corte-ingles", "la-vanguardia"];

test("parseClickref: whose click it was, which coupon and where it was made", () => {
  assert.deepEqual(parseClickref("cuponlab-aosom-1322-tienda", CLIENTS), { client: "cuponlab", couponId: 1322, source: "tienda" });
  assert.deepEqual(parseClickref("el-corte-ingles-atmosfera-sport-558", CLIENTS), { client: "el-corte-ingles", couponId: 558, source: "" });
  assert.deepEqual(parseClickref("cuponlab-el-corte-ingles-488-portada", CLIENTS), { client: "cuponlab", couponId: 488, source: "portada" }); // a store named like a client
  assert.equal(parseClickref("runnea-zapatillas-123", CLIENTS), null); // someone else's sale on the shared account
  assert.equal(parseClickref("", CLIENTS), null);
  assert.deepEqual(parseClickref("cuponlab-aosom", CLIENTS), { client: "cuponlab", couponId: null, source: "" }); // cut by the network
});

test("parseAwinTransactions keeps only our clicks, with amounts, status and dates", () => {
  const body = [
    { id: 9001, advertiserId: 17521, commissionStatus: "pending", commissionAmount: { amount: 2.5, currency: "EUR" }, saleAmount: { amount: 49.9, currency: "EUR" },
      clickRefs: { clickRef: "cuponlab-aosom-1322-tienda", clickRef2: "tienda" }, transactionDate: "2026-11-12T18:20:00" },
    { id: 9002, advertiserId: 1, commissionStatus: "approved", commissionAmount: { amount: 9, currency: "EUR" }, saleAmount: { amount: 90, currency: "EUR" },
      clickRefs: { clickRef: "runnea-home-55" }, transactionDate: "2026-11-12T19:00:00" },
    { id: 9003, advertiserId: 2, status: "approved", commissionAmount: { amount: 1, currency: "EUR" }, saleAmount: { amount: 10, currency: "EUR" },
      clickRef: "la-vanguardia-temu-77", clickRef2: "widget", transactionDate: "2026-11-11T10:00:00" },
    { id: 9004, advertiserId: 3, commissionStatus: "approved", commissionAmount: { amount: 1, currency: "EUR" }, transactionDate: "2026-11-11T10:00:00" }, // no clickref
  ];
  assert.deepEqual(parseAwinTransactions(body, "324419", CLIENTS), [
    { id: "awin:9001", network: "awin", publisherId: "324419", merchantId: "17521", client: "cuponlab", couponId: 1322, source: "tienda",
      clickref: "cuponlab-aosom-1322-tienda", amount: 2.5, currency: "EUR", saleAmount: 49.9, status: "pending", at: "2026-11-12T18:20:00" },
    { id: "awin:9003", network: "awin", publisherId: "324419", merchantId: "2", client: "la-vanguardia", couponId: 77, source: "widget",
      clickref: "la-vanguardia-temu-77", amount: 1, currency: "EUR", saleAmount: 10, status: "approved", at: "2026-11-11T10:00:00" },
  ]);
  assert.deepEqual(parseAwinTransactions(null, "1", CLIENTS), []);
});

test("awinWindows: the last N days in spans of at most 31 days (Awin's limit), Madrid time", () => {
  const w = awinWindows(45, new Date("2026-11-12T10:00:00Z"));
  assert.deepEqual(w, [
    { start: "2026-09-29T00:00:00", end: "2026-10-29T23:59:59" },
    { start: "2026-10-30T00:00:00", end: "2026-11-12T23:59:59" },
  ]);
});
