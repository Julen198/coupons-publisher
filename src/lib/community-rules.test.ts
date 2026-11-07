import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COMMENT_COOLDOWN_MESSAGE,
  PARENT_GONE_MESSAGE,
  SHARE_LIMIT_PER_DAY,
  SHARE_LIMIT_NOTE,
  SHARE_LIMIT_SKIPS,
  countsTowardShareLimit,
  commentInputError,
  expiryLimitMessage,
  moderationFlag,
  moderationId,
  publishedActivity,
  readerBlockChange,
  REJECT_REASONS,
  rejectReasonOf,
  REPORT_INACTIVE_MESSAGE,
  savedRequest,
  shareLimitMessage,
  sharedReviewPatch,
  storeIdFor,
  voteRequest,
} from "./community-rules.ts";

test("voteRequest accepts a coupon id and +1 or -1 only", () => {
  assert.deepEqual(voteRequest("12", "1"), { couponId: 12, pressed: 1 });
  assert.deepEqual(voteRequest("12", "-1"), { couponId: 12, pressed: -1 });
  assert.equal(voteRequest("12", "0"), null);
  assert.equal(voteRequest("12", "2"), null);
  assert.equal(voteRequest("x", "1"), null);
  assert.equal(voteRequest("", "1"), null);
});

test("savedRequest asks for an explicit state, so a double click can't flip it back", () => {
  assert.deepEqual(savedRequest("7", "1"), { couponId: 7, save: 1 });
  assert.deepEqual(savedRequest("7", "0"), { couponId: 7, save: 0 });
  assert.equal(savedRequest("7", "toggle"), null);
  assert.equal(savedRequest("-7", "1"), null);
});

test("commentInputError: a dead deal first, then the body", () => {
  assert.equal(commentInputError(false, "hola"), "Este chollo ya no admite comentarios");
  assert.equal(commentInputError(false, null), "Este chollo ya no admite comentarios");
  assert.equal(commentInputError(true, null), "Escribe entre 2 y 1000 caracteres");
  assert.equal(commentInputError(true, "hola"), null);
  assert.equal(PARENT_GONE_MESSAGE, "Ese comentario ya no existe");
  assert.equal(COMMENT_COOLDOWN_MESSAGE, "Espera unos segundos antes de volver a comentar");
});

test("share limit message names the limit", () => {
  assert.equal(SHARE_LIMIT_PER_DAY, 5);
  assert.equal(shareLimitMessage, "Has compartido 5 chollos hoy. Vuelve mañana");
});

test("storeIdFor finds the store by slug", () => {
  const stores = [{ id: 1, slug: "adidas" }, { id: 2, slug: "nike" }];
  assert.equal(storeIdFor(stores, "nike"), 2);
  assert.equal(storeIdFor(stores, "puma"), null);
});

test("report messages", () => {
  assert.equal(REPORT_INACTIVE_MESSAGE, "Este chollo ya no está activo");
  assert.equal(expiryLimitMessage, "Ya has avisado de 10 chollos hoy. Vuelve mañana");
});

test("moderationId and moderationFlag reject tampered values", () => {
  assert.equal(moderationId("42"), 42);
  assert.throws(() => moderationId("0"), /Identificador no válido/);
  assert.throws(() => moderationId("1; DROP"), /Identificador no válido/);
  assert.equal(moderationFlag("1"), 1);
  assert.equal(moderationFlag("0"), 0);
  assert.throws(() => moderationFlag("yes"), /Valor no válido/);
});

test("sharedReviewPatch: publishing makes it public and checked, rejecting only marks it", () => {
  assert.deepEqual(sharedReviewPatch("publish"), { archived: 0, review: "", verified: 1 });
  assert.deepEqual(sharedReviewPatch("reject"), { review: "rejected" });
});

test("readerBlockChange: blocking revokes sessions, unblocking does not", () => {
  assert.deepEqual(readerBlockChange(1), { status: "blocked", sessionBump: 1 });
  assert.deepEqual(readerBlockChange(0), { status: "active", sessionBump: 0 });
});

test("publishedActivity names the reader, or a generic one", () => {
  assert.equal(publishedActivity("ana", "20% en Nike"), "Publicado el chollo compartido por @ana: 20% en Nike");
  assert.equal(publishedActivity(null, "20% en Nike"), "Publicado el chollo compartido por @lector: 20% en Nike");
});

test("rejectReasonOf only accepts the preset reasons", () => {
  assert.deepEqual(REJECT_REASONS, ["ya estaba publicado", "ha caducado", "no es un chollo", "el enlace no funciona", "falta información"]);
  for (const r of REJECT_REASONS) assert.equal(rejectReasonOf(r), r);
  assert.throws(() => rejectReasonOf(""), /Elige un motivo/);
  assert.throws(() => rejectReasonOf("spam <b>"), /Elige un motivo/);
  assert.throws(() => rejectReasonOf("Ha caducado"), /Elige un motivo/);
});

test("a rejected share doesn't count toward the daily limit; pending and published ones do", () => {
  assert.deepEqual(SHARE_LIMIT_SKIPS, ["rejected"]);
  assert.equal(countsTowardShareLimit("rejected"), false);
  assert.equal(countsTowardShareLimit("pending"), true);
  assert.equal(countsTowardShareLimit(""), true);
  assert.equal(SHARE_LIMIT_NOTE, "Un chollo rechazado no se publica y no cuenta para el límite diario.");
});
