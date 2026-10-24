import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, toCsv } from "./csv.ts";

test("parses quotes, escaped quotes, embedded commas/newlines, CRLF and BOM", () => {
  const text = '﻿tienda,titulo,codigo\r\nadidas,"Cupón ""15%"", estudiantes",STUDENT15\r\n"Shein","línea 1\nlínea 2",\r\n\r\n';
  assert.deepEqual(parseCsv(text), [
    ["tienda", "titulo", "codigo"],
    ["adidas", 'Cupón "15%", estudiantes', "STUDENT15"],
    ["Shein", "línea 1\nlínea 2", ""],
  ]);
});

test("detects ; separator from the header", () => {
  assert.deepEqual(parseCsv("tienda;titulo\nadidas;Outlet, -50%"), [["tienda", "titulo"], ["adidas", "Outlet, -50%"]]);
});

test("toCsv quotes when needed, neutralises formulas, and round-trips", () => {
  const out = toCsv(["a", "b"], [["x,y", '=HYPERLINK("evil")'], [null, 3]]);
  assert.equal(out, 'a,b\r\n"x,y","\'=HYPERLINK(""evil"")"\r\n,3\r\n');
  assert.deepEqual(parseCsv(out), [["a", "b"], ["x,y", `'=HYPERLINK("evil")`], ["", "3"]]);
});
