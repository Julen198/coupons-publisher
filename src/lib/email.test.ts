import assert from "node:assert/strict";
import { test } from "node:test";
import { missingEmailConfig } from "./email.ts";

test("missingEmailConfig: names the Resend settings that are unset or blank, never their values", () => {
  assert.deepEqual(missingEmailConfig({ RESEND_API_KEY: "re_x", RESEND_FROM: "CuponLab <hola@cuponlab.es>" }), []);
  assert.deepEqual(missingEmailConfig({}), ["RESEND_API_KEY", "RESEND_FROM"]);
  assert.deepEqual(missingEmailConfig({ RESEND_API_KEY: "re_x" }), ["RESEND_FROM"]);
  assert.deepEqual(missingEmailConfig({ RESEND_API_KEY: " ", RESEND_FROM: "a@b.es" }), ["RESEND_API_KEY"]);
});
