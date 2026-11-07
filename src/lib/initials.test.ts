import { test } from "node:test";
import assert from "node:assert/strict";
import { initialsOf } from "./initials.ts";

test("initialsOf: digits, then the capitals of a mixed-case name, at most 3", () => {
  assert.equal(initialsOf("43einhalb DE"), "43");
  assert.equal(initialsOf("El Corte Inglés"), "ECI");
  assert.equal(initialsOf("PcComponentes"), "PC");
  assert.equal(initialsOf("zalando"), "Z");
});

test("initialsOf: a one-word name in capitals is a brand, not initials: its first letter", () => {
  assert.equal(initialsOf("IKEA"), "I");
  assert.equal(initialsOf("ASMAX"), "A");
  assert.equal(initialsOf("HP"), "HP");
  assert.equal(initialsOf("LOOKFANTASTIC"), "L");
});
