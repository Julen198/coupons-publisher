import assert from "node:assert/strict";
import { test } from "node:test";
import { checkedDay, checkedLabel, isPerk, lastChecked, perkInput, withoutPerks } from "./perks.ts";

test("perkInput and isPerk only know the listed standing offers", () => {
  assert.equal(perkInput("newsletter"), "newsletter");
  assert.equal(perkInput(" envio "), "envio");
  assert.equal(perkInput("regalo"), "");
  assert.equal(isPerk({ perk: "app" }), true);
  assert.equal(isPerk({ perk: "" }), false);
  assert.equal(isPerk({}), false);
  assert.deepEqual(withoutPerks([{ id: 1, perk: "" }, { id: 2, perk: "bienvenida" }, { id: 3 }]).map((c) => c.id), [1, 3]);
});

test("checkedDay is the Madrid day of the check", () => {
  assert.equal(checkedDay(new Date("2026-11-15T23:30:00Z")), "2026-11-16");
  assert.equal(checkedDay("2026-11-15T10:00:00Z"), "2026-11-15");
  assert.equal(checkedDay(null), "");
  assert.equal(checkedDay(undefined), "");
  assert.equal(checkedDay("no es fecha"), "");
});

test("checkedLabel names the day only when there was a real check", () => {
  assert.equal(checkedLabel("", "2026-11-16"), "Comprobado");
  assert.equal(checkedLabel("2026-11-16", "2026-11-16"), "Comprobado hoy");
  assert.equal(checkedLabel("2026-11-15", "2026-11-16"), "Comprobado ayer");
  assert.equal(checkedLabel("2026-11-03", "2026-11-16"), "Comprobado el 3 nov");
  assert.equal(checkedLabel("2026-12-31", "2027-01-01"), "Comprobado ayer");
});

test("lastChecked is the latest dated check", () => {
  assert.equal(lastChecked([{ checked_at: null }, { checked_at: new Date("2026-11-10T10:00:00Z") }, { checked_at: new Date("2026-11-14T10:00:00Z") }, {}]), "2026-11-14");
  assert.equal(lastChecked([{ checked_at: null }]), "");
});
