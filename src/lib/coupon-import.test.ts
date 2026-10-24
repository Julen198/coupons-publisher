import { test } from "node:test";
import assert from "node:assert/strict";
import { mapCouponRows } from "./coupon-import.ts";

const stores = [{ id: 1, name: "adidas", slug: "adidas", website: "https://www.adidas.es" }, { id: 2, name: "El Corte Inglés", slug: "el-corte-ingles", website: "https://www.elcorteingles.es" }];

test("maps rows by loose header names and store slug or name", () => {
  const { inserts, errors } = mapCouponRows(
    [
      ["Tienda", "Título", "Código", "Descuento", "URL", "Caduca", "Verificado"],
      ["adidas", "Cupón estudiantes", "student15", "15%", "https://www.adidas.es/x", "31/12/2026", "sí"],
      ["el corte inglés", "Rebajas", "", "50%", "", "", ""],
    ],
    stores,
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(inserts[0], { store_id: 1, kind: "code", title: "Cupón estudiantes", code: "STUDENT15", discount: "15%", description: "", target_url: "https://www.adidas.es/x", expires_at: "2026-12-31", verified: 1 });
  assert.equal(inserts[1].kind, "deal");
  assert.equal(inserts[1].store_id, 2);
  assert.equal(inserts[1].target_url, "https://www.elcorteingles.es"); // falls back to the store web
});

test("reports each bad line with its reason", () => {
  const { inserts, errors } = mapCouponRows(
    [["tienda", "titulo", "url", "caduca"], ["nike", "X", "", ""], ["adidas", "", "", ""], ["adidas", "Y", "javascript:alert(1)", ""], ["adidas", "Z", "", "mañana"]],
    stores,
  );
  assert.equal(inserts.length, 0);
  assert.deepEqual(errors.map((e) => e.split(":")[0]), ["Línea 2", "Línea 3", "Línea 4", "Línea 5"]);
});

test("rejects a file without the required columns", () => {
  assert.match(mapCouponRows([["foo", "bar"]], stores).errors[0], /tienda/);
});
