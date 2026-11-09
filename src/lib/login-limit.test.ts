import { test } from "node:test";
import assert from "node:assert/strict";
import { attemptKeys, blockedFor, clientIp, LOGIN_LIMITS } from "./login-limit.ts";

test("attemptKeys: one key per account and one per IP, hashed (no email or IP stored)", () => {
  const k = attemptKeys("Ana@Medio.es ", "203.0.113.7");
  assert.match(k.account, /^a:[0-9a-f]{32}$/);
  assert.match(k.ip, /^i:[0-9a-f]{32}$/);
  assert.equal(k.account, attemptKeys("ana@medio.es", "198.51.100.1").account); // same account whatever the IP or case
  assert.notEqual(k.ip, attemptKeys("ana@medio.es", "198.51.100.1").ip);
  assert.ok(!k.account.includes("ana") && !k.ip.includes("203"));
});

test("blockedFor: 5 failures on an account or 20 from one IP within the window lock login", () => {
  assert.equal(LOGIN_LIMITS.windowMinutes, 15);
  assert.equal(blockedFor({ account: 4, ip: 19 }), null);
  assert.equal(blockedFor({ account: 5, ip: 0 }), "account");
  assert.equal(blockedFor({ account: 0, ip: 20 }), "ip");
  assert.equal(blockedFor({ account: 9, ip: 30 }), "account");
});

test("clientIp: first address of x-forwarded-for (set by Vercel), else x-real-ip, else unknown", () => {
  assert.equal(clientIp("203.0.113.7, 10.0.0.1", null), "203.0.113.7");
  assert.equal(clientIp(null, " 198.51.100.2 "), "198.51.100.2");
  assert.equal(clientIp(null, null), "unknown");
});
