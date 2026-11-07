import { test } from "node:test";
import assert from "node:assert/strict";
import { badgeLabel, discountBadge } from "./discount.ts";

test("discountBadge keeps short badges and never cuts words", () => {
  const cases: [string, string][] = [
    ["15%", "15%"], ["10€", "10€"], ["-17%", "-17%"], ["2×1", "2×1"], ["2x1", "2x1"], ["Envío gratis", "Envío gratis"],
    ["Hasta 50%", "Hasta 50%"], ["Hasta -76%", "Hasta -76%"], ["2,5 € de dto", "2,5 €"], ["20€ (antes 60€)", "20€"],
    ["10% extra con código", "10%"], ["50% en la 2ª unidad", "50%"], ["Precio rebajado", ""], ["Lleva 3 y paga 2", "3x2"],
    ["1 mes gratis", "1 mes gratis"], ["Regalo", "Regalo"], ["3.000 o 5.000 puntos", ""], ["", ""],
  ];
  for (const [input, want] of cases) assert.equal(discountBadge(input), want, input);
});

test("discountBadge ignores percentages no shop discount reaches", () => {
  // "PURITÀ DEL 99,99%" is the product's purity, not a discount
  for (const s of ["CREATINA MICRONIZZATA PER UNA PURITÀ DEL 99,99%", "100% algodón", "99,99%"]) assert.equal(discountBadge(s), "", s);
  assert.equal(discountBadge("Hasta 90%"), "Hasta 90%");
});

test("badgeLabel writes every figure one way: no minus, a space before % and €", () => {
  const cases: [string, string][] = [
    ["60%", "60 %"], ["60 %", "60 %"], ["-60 %", "60 %"], ["-17%", "17 %"], ["Hasta 83%", "Hasta 83 %"], ["Hasta -76%", "Hasta 76 %"],
    ["hasta 50 % en moda", "Hasta 50 %"], ["5€", "5 €"], ["-5 €", "5 €"], ["2,5 € de dto", "2,5 €"], ["20€ (antes 60€)", "20 €"],
    ["2x1", "2x1"], ["3x2", "3x2"], ["Lleva 3 y paga 2", "3x2"], ["Envío gratis", "Envío gratis"], ["1 mes gratis", "1 mes gratis"],
    ["Precio rebajado", ""], ["", ""], ["99,99%", ""],
  ];
  for (const [input, want] of cases) assert.equal(badgeLabel(input), want, input);
});
