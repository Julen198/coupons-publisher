import assert from "node:assert/strict";
import { test } from "node:test";
import { storeUsesLabel, usageLine, USES_MIN } from "./usage-signals.ts";

const now = new Date("2026-11-23T12:00:00Z");
const ago = (h: number) => new Date(now.getTime() - h * 3_600_000);

test("usageLine shows the week's uses only from the minimum up", () => {
  assert.equal(usageLine({ uses_week: USES_MIN, last_used_at: null }, now), `Usado ${USES_MIN} veces esta semana`);
  assert.equal(usageLine({ uses_week: USES_MIN - 1, last_used_at: null }, now), "");
  assert.equal(usageLine({ uses_week: 0, last_used_at: null }, now), "");
  assert.equal(usageLine({}, now), "");
});

test("usageLine adds a recent last use, and drops an old one", () => {
  assert.equal(usageLine({ uses_week: 12, last_used_at: ago(2) }, now), "Usado 12 veces esta semana · último uso hace 2 h");
  assert.equal(usageLine({ uses_week: 2, last_used_at: ago(0.5) }, now), "Último uso hace 30 min");
  assert.equal(usageLine({ uses_week: 2, last_used_at: ago(100) }, now), "");
  assert.equal(usageLine({ uses_week: 7, last_used_at: ago(100) }, now), "Usado 7 veces esta semana");
  assert.equal(usageLine({ uses_week: 7, last_used_at: "2026-11-22T12:00:00Z" }, now), "Usado 7 veces esta semana · último uso hace 1 día");
  assert.equal(usageLine({ uses_week: 1, last_used_at: "no es fecha" }, now), "");
});

test("storeUsesLabel adds up the store's coupons", () => {
  assert.equal(storeUsesLabel([{ uses_week: 3 }, { uses_week: 4 }]), "7 usos esta semana");
  assert.equal(storeUsesLabel([{ uses_week: 1 }, {}]), "");
  assert.equal(storeUsesLabel([]), "");
});
