import { test } from "node:test";
import assert from "node:assert/strict";
import { decryptJson, encryptJson } from "./secrets.ts";

test("credentials round-trip and never appear in clear", () => {
  const blob = encryptJson({ token: "abc123secret" }, "s1");
  assert.doesNotMatch(blob, /abc123secret/);
  assert.deepEqual(decryptJson(blob, "s1"), { token: "abc123secret" });
});

test("a different secret or a tampered blob is rejected", () => {
  const blob = encryptJson({ token: "x" }, "s1");
  assert.throws(() => decryptJson(blob, "s2"), /SESSION_SECRET/);
  const parts = blob.split(".");
  parts[3] = Buffer.from("tampered").toString("base64url");
  assert.throws(() => decryptJson(parts.join("."), "s1"));
});
