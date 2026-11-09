import { test } from "node:test";
import assert from "node:assert/strict";
import { accountHref, accountTabOf, accountTabs, liveFirst, sharedStatus } from "./account.ts";

test("accountTabOf reads the three tabs and falls back to Compartidos (sharing on)", () => {
  assert.equal(accountTabOf("guardados", true), "guardados");
  assert.equal(accountTabOf("comentarios", true), "comentarios");
  assert.equal(accountTabOf("compartidos", true), "compartidos");
  assert.equal(accountTabOf("alertas", true), "compartidos");
  assert.equal(accountTabOf(undefined, true), "compartidos");
  assert.equal(accountTabOf(["guardados"], true), "compartidos");
});

test("accountHref keeps the first tab at the bare URL (sharing on)", () => {
  assert.equal(accountHref("compartidos", true), "/cuenta");
  assert.equal(accountHref("guardados", true), "/cuenta?tab=guardados");
});

test("sharing off: no Compartidos tab, the account opens on Guardados", () => {
  assert.deepEqual(accountTabs(false).map((t) => t.slug), ["guardados", "comentarios"]);
  assert.equal(accountTabOf("compartidos", false), "guardados");
  assert.equal(accountTabOf(undefined, false), "guardados");
  assert.equal(accountHref("guardados", false), "/cuenta");
  assert.equal(accountHref("comentarios", false), "/cuenta?tab=comentarios");
});

test("sharedStatus reads review first, then archived", () => {
  assert.deepEqual(sharedStatus({ review: "pending", archived: 1 }), { label: "En revisión", badge: "b-exp" });
  assert.deepEqual(sharedStatus({ review: "rejected", archived: 1 }), { label: "Rechazado", badge: "b-low" });
  assert.deepEqual(sharedStatus({ review: "", archived: 0 }), { label: "Publicado", badge: "b-ok" });
  assert.deepEqual(sharedStatus({ review: "", archived: 1 }), { label: "Retirado", badge: "b-exp" });
});

test("sharedStatus names the rejection reason when there is one", () => {
  assert.deepEqual(sharedStatus({ review: "rejected", archived: 1, review_reason: "ya estaba publicado" }), { label: "Rechazado: ya estaba publicado", badge: "b-low" });
  assert.deepEqual(sharedStatus({ review: "rejected", archived: 1, review_reason: "" }), { label: "Rechazado", badge: "b-low" });
  assert.deepEqual(sharedStatus({ review: "rejected", archived: 1, review_reason: "  " }), { label: "Rechazado", badge: "b-low" });
});

test("liveFirst puts live deals first and keeps the given order inside each group", () => {
  const rows = [{ id: 1, live: false }, { id: 2, live: true }, { id: 3, live: false }, { id: 4, live: true }];
  assert.deepEqual(liveFirst(rows).map((r) => r.id), [2, 4, 1, 3]);
  assert.deepEqual(rows.map((r) => r.id), [1, 2, 3, 4]);
});
