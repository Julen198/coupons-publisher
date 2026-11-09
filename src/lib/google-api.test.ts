import { test } from "node:test";
import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { dateRange, parseServiceAccount, rowsOfGa4, rowsOfSearch, signedJwt } from "./google-api.ts";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

test("parseServiceAccount reads the key JSON and refuses anything else", () => {
  const raw = JSON.stringify({ type: "service_account", client_email: "x@y.iam.gserviceaccount.com", private_key: pem });
  assert.deepEqual(parseServiceAccount(raw), { email: "x@y.iam.gserviceaccount.com", key: pem });
  assert.equal(parseServiceAccount(""), null);
  assert.equal(parseServiceAccount(undefined), null);
  assert.equal(parseServiceAccount("{nope"), null);
  assert.equal(parseServiceAccount(JSON.stringify({ client_email: "a" })), null);
});

test("signedJwt is a valid RS256 token for Google's token endpoint", () => {
  const jwt = signedJwt({ email: "x@y.iam.gserviceaccount.com", key: pem }, ["s1", "s2"], 1_700_000_000);
  const [h, c, sig] = jwt.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(h, "base64url").toString()), { alg: "RS256", typ: "JWT" });
  assert.deepEqual(JSON.parse(Buffer.from(c, "base64url").toString()), {
    iss: "x@y.iam.gserviceaccount.com", scope: "s1 s2", aud: "https://oauth2.googleapis.com/token", iat: 1_700_000_000, exp: 1_700_003_600,
  });
  assert.ok(createVerify("RSA-SHA256").update(`${h}.${c}`).verify(publicKey, Buffer.from(sig, "base64url")));
});

test("dateRange gives the last n full days and the n before, in Madrid dates", () => {
  const r = dateRange(7, new Date("2026-11-09T10:00:00Z"));
  assert.deepEqual(r, { start: "2026-11-02", end: "2026-11-08", prevStart: "2026-10-26", prevEnd: "2026-11-01" });
});

test("rowsOfSearch flattens Search Console rows", () => {
  const body = { rows: [{ keys: ["cupón kiwoko", "https://www.cuponlab.com/tiendas/kiwoko"], clicks: 3, impressions: 120, ctr: 0.025, position: 12.4 }] };
  assert.deepEqual(rowsOfSearch(body), [{ keys: ["cupón kiwoko", "https://www.cuponlab.com/tiendas/kiwoko"], clicks: 3, impressions: 120, position: 12.4 }]);
  assert.deepEqual(rowsOfSearch({}), []);
});

test("rowsOfGa4 maps dimension and metric values", () => {
  const body = { rows: [{ dimensionValues: [{ value: "20261108" }], metricValues: [{ value: "42" }] }] };
  assert.deepEqual(rowsOfGa4(body), [{ dims: ["20261108"], values: [42] }]);
  assert.deepEqual(rowsOfGa4({}), []);
});

test("storeSlugOf and meanPosition ", async () => {
  const { storeSlugOf, meanPosition } = await import("./google-api.ts");
  assert.equal(storeSlugOf("https://www.cuponlab.com/tiendas/kiwoko"), "kiwoko");
  assert.equal(storeSlugOf("/tiendas/el-corte-ingles/?utm_source=x"), "el-corte-ingles");
  assert.equal(storeSlugOf("/chollos/x"), null);
  assert.equal(meanPosition([{ keys: [], clicks: 0, impressions: 100, position: 10 }, { keys: [], clicks: 0, impressions: 300, position: 20 }]), 17.5);
  assert.equal(meanPosition([]), null);
});

test("googleKeyProblem tells a missing key from a broken one", async () => {
  const { googleKeyProblem } = await import("./google-api.ts");
  assert.equal(googleKeyProblem(""), "sin credenciales");
  assert.equal(googleKeyProblem("{"), "clave no válida (1 caracteres)");
  assert.equal(googleKeyProblem(JSON.stringify({ client_email: "a@b", private_key: "k" })), "");
});
