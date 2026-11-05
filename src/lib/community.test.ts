import assert from "node:assert/strict";
import { test } from "node:test";
import { byVotes, cleanComment, cleanHandle, couponIdOf, nextVote, timeAgo } from "./community.ts";

test("cleanHandle", () => {
  assert.equal(cleanHandle("  Runner_Bilbo "), "runner_bilbo");
  assert.equal(cleanHandle("ab"), null);
  assert.equal(cleanHandle("con espacio"), null);
  assert.equal(cleanHandle("a".repeat(21)), null);
});
test("cleanComment", () => {
  assert.equal(cleanComment("  ok  "), "ok");
  assert.equal(cleanComment("a"), null);
  assert.equal(cleanComment("x".repeat(1001)), null);
  assert.equal(cleanComment("uno\n\n\n\ndos"), "uno\n\ndos");
});
test("nextVote toggles and flips", () => {
  assert.equal(nextVote(0, 1), 1);
  assert.equal(nextVote(1, 1), 0);
  assert.equal(nextVote(1, -1), -1);
  assert.equal(nextVote(-1, -1), 0);
});
test("timeAgo", () => {
  const now = new Date("2026-11-05T12:00:00Z");
  assert.equal(timeAgo(new Date("2026-11-05T11:59:30Z"), now), "hace un momento");
  assert.equal(timeAgo(new Date("2026-11-05T11:15:00Z"), now), "hace 45 min");
  assert.equal(timeAgo(new Date("2026-11-05T09:00:00Z"), now), "hace 3 h");
  assert.equal(timeAgo(new Date("2026-11-04T10:00:00Z"), now), "hace 1 día");
  assert.equal(timeAgo(new Date("2026-11-02T12:00:00Z"), now), "hace 3 días");
});

test("byVotes ranks by score, then checked, then discount, then newest", () => {
  const d = (id: number, score: number, verified = 0, discount = "") => ({ id, score, verified, discount });
  const list = [d(1, 0, 1, "10%"), d(2, 3), d(3, 0, 1, "30%"), d(4, -1, 1), d(5, 0, 0)];
  assert.deepEqual([...list].sort(byVotes).map((x) => x.id), [2, 3, 1, 5, 4]);
});

test("cleanComment normalises browser line endings first", () => {
  assert.equal(cleanComment("uno\r\n\r\n\r\n\r\ndos"), "uno\n\ndos");
  assert.equal(cleanComment("uno\rdos"), "uno\ndos");
  assert.equal(cleanComment("a\r\n".repeat(500) + "b"), null);
  assert.equal(cleanComment("a\r\n".repeat(499) + "a"), "a\n".repeat(499) + "a");
});

test("couponIdOf accepts only plain positive ids that fit an integer column", () => {
  assert.equal(couponIdOf("42"), 42);
  assert.equal(couponIdOf("999999999"), 999999999);
  for (const bad of ["", "0", "-1", "1.5", "1e3", " 7", "1234567890", "abc", "007x"]) assert.equal(couponIdOf(bad), null, bad);
});
