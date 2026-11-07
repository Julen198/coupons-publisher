import { test } from "node:test";
import assert from "node:assert/strict";
import { codeFromText } from "./coupon-code.ts";

const aosom = "Ahorra un 15% con el cupón BLACK15, o un 12% en juguetes con BLACK12.";

test("a spaced code takes the description's spelling", () => {
  assert.equal(codeFromText("Black 15", aosom), "BLACK15");
  assert.equal(codeFromText("Black 12", aosom), "BLACK12");
});

test("codes without spaces, or not in the text, stay as sent", () => {
  assert.equal(codeFromText("AOCPX2", aosom), "AOCPX2");
  assert.equal(codeFromText(" SUMMER ", ""), "SUMMER");
  assert.equal(codeFromText("Black 20", aosom), "Black 20");
});
