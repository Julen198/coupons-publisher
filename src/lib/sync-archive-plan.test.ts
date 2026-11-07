import { test } from "node:test";
import assert from "node:assert/strict";
import { archivePlan } from "./sync-archive-plan.ts";

const live = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1, external_id: `awin:${i + 1}` }));
const got = (...ids: number[]) => new Set(ids.map((i) => `awin:${i}`));

test("offers that left the feed are archived", () => {
  assert.deepEqual(archivePlan(live(3), got(1, 3), 2), { archive: [2] });
  assert.deepEqual(archivePlan(live(3), got(1, 2, 3, 4), 4), { archive: [] });
});

test("a run that returned 0 offers archives nothing", () => {
  const plan = archivePlan(live(3), new Set(), 0);
  assert.ok("skip" in plan);
});

test("a feed that would drop most of a big set archives nothing; a small set may empty out", () => {
  assert.ok("skip" in archivePlan(live(40), got(1, 2, 3), 3));
  assert.deepEqual(archivePlan(live(40), got(...Array.from({ length: 25 }, (_, i) => i + 1)), 25), { archive: Array.from({ length: 15 }, (_, i) => i + 26) });
  assert.deepEqual(archivePlan(live(4), got(99), 1), { archive: [1, 2, 3, 4] });
});
