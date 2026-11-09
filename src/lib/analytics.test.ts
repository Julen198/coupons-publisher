import { test } from "node:test";
import assert from "node:assert/strict";
import { consentDefaultsScript, consentOf, gaMeasurementId, googleSiteVerification } from "./analytics.ts";

test("gaMeasurementId takes a G- id and drops anything else", () => {
  assert.equal(gaMeasurementId("G-ABC123XYZ"), "G-ABC123XYZ");
  assert.equal(gaMeasurementId("  g-abc123xyz "), "G-ABC123XYZ");
  assert.equal(gaMeasurementId("UA-12345-1"), "");
  assert.equal(gaMeasurementId("G-1');alert(1)//"), "");
  assert.equal(gaMeasurementId(""), "");
  assert.equal(gaMeasurementId(undefined), "");
});

test("googleSiteVerification takes the token or the pasted meta tag", () => {
  assert.equal(googleSiteVerification("abcDEF123_-xyz"), "abcDEF123_-xyz");
  assert.equal(googleSiteVerification('<meta name="google-site-verification" content="abcDEF123_-xyz" />'), "abcDEF123_-xyz");
  assert.equal(googleSiteVerification("short"), "");
  assert.equal(googleSiteVerification(undefined), "");
});

test("consentOf only knows the two choices", () => {
  assert.equal(consentOf("granted"), "granted");
  assert.equal(consentOf("denied"), "denied");
  assert.equal(consentOf("yes"), null);
  assert.equal(consentOf(null), null);
});

test("the defaults script starts denied and configures the id", () => {
  const s = consentDefaultsScript("G-ABC123");
  assert.match(s, /analytics_storage:c==='granted'\?'granted':'denied'/);
  assert.match(s, /ad_storage:'denied'/);
  assert.match(s, /gtag\('config','G-ABC123'\)/);
});
