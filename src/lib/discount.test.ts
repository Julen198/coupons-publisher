import { test } from "node:test";
import assert from "node:assert/strict";
import { discountBadge } from "./discount.ts";

test("discountBadge keeps short badges and never cuts words", () => {
  const cases: [string, string][] = [
    ["15%", "15%"], ["10€", "10€"], ["-17%", "-17%"], ["2×1", "2×1"], ["2x1", "2x1"], ["Envío gratis", "Envío gratis"],
    ["Hasta 50%", "Hasta 50%"], ["Hasta -76%", "Hasta -76%"], ["2,5 € de dto", "2,5 €"], ["20€ (antes 60€)", "20€"],
    ["10% extra con código", "10%"], ["50% en la 2ª unidad", "50%"], ["Precio rebajado", ""], ["Lleva 3 y paga 2", "3x2"],
    ["1 mes gratis", "1 mes gratis"], ["Regalo", "Regalo"], ["3.000 o 5.000 puntos", ""], ["", ""],
  ];
  for (const [input, want] of cases) assert.equal(discountBadge(input), want, input);
});
