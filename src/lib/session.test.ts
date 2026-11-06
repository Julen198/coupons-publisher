import { test } from "node:test";
import assert from "node:assert/strict";
import { safeEqual, safeNext, signReader, signSession, verifyReader, verifySession } from "./session.ts";
import { hashPassword, verifyPassword } from "./password.ts";

test("signed session round-trips and rejects tampering or a wrong secret", async () => {
  const token = await signSession("s3cret", 7, 2);
  assert.deepEqual(await verifySession("s3cret", token), { userId: 7, version: 2 });
  assert.equal(await verifySession("otro", token), null);
  assert.equal(await verifySession("s3cret", token.replace(/^7\./, "1.")), null); // user id swapped
  assert.equal(await verifySession("s3cret", "garbage"), null);
  assert.equal(await verifySession(undefined, token), null);
});

test("password hashing verifies the right password only", async () => {
  const stored = await hashPassword("una contraseña larga");
  assert.match(stored, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.equal(await verifyPassword("una contraseña larga", stored), true);
  assert.equal(await verifyPassword("otra", stored), false);
  assert.equal(await verifyPassword("x", null), false);
  assert.notEqual(stored, await hashPassword("una contraseña larga")); // salted
});

test("safeEqual", () => {
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("abc", "abcd"), false);
});

test("safeNext only allows same-site paths", () => {
  assert.equal(safeNext("/coupons?status=pending"), "/coupons?status=pending");
  assert.equal(safeNext("//evil.com"), "/panel");
  assert.equal(safeNext("https://evil.com"), "/panel");
  assert.equal(safeNext(null), "/panel");
});

test("reader tokens round-trip and are not panel tokens", async () => {
  const t = await signReader("s3cret", 7, 2);
  assert.deepEqual(await verifyReader("s3cret", t), { readerId: 7, version: 2 });
  assert.equal(await verifyReader("other", t), null);
  assert.equal(await verifySession("s3cret", t), null);
  assert.equal(await verifyReader("s3cret", await signSession("s3cret", 7, 2)), null);
  assert.equal(await verifyReader("s3cret", t.replace(".2.", ".3.")), null);
  assert.equal(await verifyReader(undefined, t), null);
});

test("safeNext falls back per caller", () => {
  assert.equal(safeNext("//evil.com", "/"), "/");
  assert.equal(safeNext(null, "/"), "/");
  assert.equal(safeNext("/chollos/5-x"), "/chollos/5-x");
  assert.equal(safeNext(undefined), "/panel");
});

test("safeNext rejects backslash, whitespace and control tricks that browsers read as another host", () => {
  assert.equal(safeNext("/\\evil.com", "/"), "/");
  assert.equal(safeNext("/\t/evil.com", "/"), "/");
  assert.equal(safeNext("/\n/evil.com", "/"), "/");
  assert.equal(safeNext("/%5Cevil.com", "/"), "/%5Cevil.com");
  assert.equal(safeNext("/chollos/5-x?y=1#z", "/"), "/chollos/5-x?y=1#z");
});
