import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanComment, cleanHandle, nextVote, timeAgo } from "./community.ts";

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
