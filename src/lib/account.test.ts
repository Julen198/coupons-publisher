import { test } from "node:test";
import assert from "node:assert/strict";
import { accountHref, accountTabOf, liveFirst, sharedStatus } from "./account.ts";

test("accountTabOf reads the three tabs and falls back to Compartidos", () => {
  assert.equal(accountTabOf("guardados"), "guardados");
  assert.equal(accountTabOf("comentarios"), "comentarios");
  assert.equal(accountTabOf("compartidos"), "compartidos");
  assert.equal(accountTabOf("alertas"), "compartidos");
  assert.equal(accountTabOf(undefined), "compartidos");
  assert.equal(accountTabOf(["guardados"]), "compartidos");
});

test("accountHref keeps Compartidos at the bare URL", () => {
  assert.equal(accountHref("compartidos"), "/cuenta");
  assert.equal(accountHref("guardados"), "/cuenta?tab=guardados");
});

test("sharedStatus reads review first, then archived", () => {
  assert.deepEqual(sharedStatus({ review: "pending", archived: 1 }), { label: "En revisión", badge: "b-exp" });
  assert.deepEqual(sharedStatus({ review: "rejected", archived: 1 }), { label: "Rechazado", badge: "b-low" });
  assert.deepEqual(sharedStatus({ review: "", archived: 0 }), { label: "Publicado", badge: "b-ok" });
  assert.deepEqual(sharedStatus({ review: "", archived: 1 }), { label: "Retirado", badge: "b-exp" });
});

test("liveFirst puts live deals first and keeps the given order inside each group", () => {
  const rows = [{ id: 1, live: false }, { id: 2, live: true }, { id: 3, live: false }, { id: 4, live: true }];
  assert.deepEqual(liveFirst(rows).map((r) => r.id), [2, 4, 1, 3]);
  assert.deepEqual(rows.map((r) => r.id), [1, 2, 3, 4]);
});
