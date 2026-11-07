import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeFlash, encodeFlash, flashMessage, formatCountdown, handleInitial, handlePreview, RESEND_SECONDS, resendLabel } from "./reader-entry.ts";

test("formatCountdown: m:ss, never negative", () => {
  assert.equal(formatCountdown(60), "1:00");
  assert.equal(formatCountdown(42), "0:42");
  assert.equal(formatCountdown(5), "0:05");
  assert.equal(formatCountdown(0), "0:00");
  assert.equal(formatCountdown(-3), "0:00");
  assert.equal(formatCountdown(4.2), "0:05");
});

test("resendLabel: counts down, then offers the resend", () => {
  assert.equal(RESEND_SECONDS, 65); // past the server's 60 s per-email limit, so a resend at 0:00 really sends
  assert.equal(resendLabel(42), "Reenviar en 0:42");
  assert.equal(resendLabel(0), "Reenviar");
});

test("handlePreview: what will be saved, lower case and trimmed", () => {
  assert.equal(handlePreview("  Julen_Chollos "), "julen_chollos");
  assert.equal(handlePreview(""), "");
  assert.equal(handleInitial("julen"), "J");
  assert.equal(handleInitial("_x"), "_");
  assert.equal(handleInitial(""), "?");
});

test("flash: encodes, decodes, and rejects anything else", () => {
  assert.equal(encodeFlash({ kind: "in", handle: "julen" }), "in:julen");
  assert.deepEqual(decodeFlash("in:julen"), { kind: "in", handle: "julen" });
  assert.deepEqual(decodeFlash(encodeFlash({ kind: "new", handle: "a_1" })), { kind: "new", handle: "a_1" });
  assert.equal(decodeFlash(undefined), null);
  assert.equal(decodeFlash("in:"), null);
  assert.equal(decodeFlash("out:julen"), null);
  assert.equal(decodeFlash("in:<script>"), null);
  assert.equal(decodeFlash("in:" + "a".repeat(21)), null);
});

test("flashMessage", () => {
  assert.equal(flashMessage({ kind: "in", handle: "julen" }), "Ya has entrado como @julen");
  assert.equal(flashMessage({ kind: "new", handle: "julen" }), "Bienvenido a CuponLab, @julen");
});
