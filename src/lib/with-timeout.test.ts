import assert from "node:assert/strict";
import { test } from "node:test";
import { orNullAfter } from "./with-timeout.ts";

const later = <T>(ms: number, value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

test("orNullAfter: the value when it arrives in time", async () => {
  assert.equal(await orNullAfter(later(5, "ok"), 200), "ok");
});

test("orNullAfter: null when the work outlasts the limit", async () => {
  const started = Date.now();
  assert.equal(await orNullAfter(later(500, "late"), 20), null);
  assert.ok(Date.now() - started < 300);
});

test("orNullAfter: null when the work fails, and the error is reported", async () => {
  const seen: unknown[] = [];
  const boom = new Error("pooler down");
  assert.equal(await orNullAfter(Promise.reject(boom), 200, (e) => seen.push(e)), null);
  assert.deepEqual(seen, [boom]);
});

test("orNullAfter: a timeout is reported too, and a late rejection never escapes", async () => {
  const seen: unknown[] = [];
  const late = new Promise((_, reject) => setTimeout(() => reject(new Error("late")), 30));
  assert.equal(await orNullAfter(late, 5, (e) => seen.push(e)), null);
  assert.equal(seen.length, 1);
  assert.match(String(seen[0]), /timed out after 5 ms/);
  await later(50, null); // the late rejection settles here without an unhandled rejection
  assert.equal(seen.length, 1);
});
