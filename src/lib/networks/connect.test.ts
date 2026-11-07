import { test } from "node:test";
import assert from "node:assert/strict";
import { bearer, parseAwinAccounts, pickAwinAccount } from "./awin.ts";
import { httpError, networkError, readableBody } from "./types.ts";

test("HTTP errors read as what to do, not as a raw status", () => {
  assert.match(httpError(401, ""), /no reconoce estas credenciales/);
  assert.match(httpError(403, ""), /no les deja leer/);
  assert.match(httpError(403, "2: Token not authorized for request."), /no reconoce estas credenciales/);
  assert.match(httpError(429, ""), /prueba en unos minutos/);
  assert.match(httpError(503, ""), /prueba en unos minutos/);
  assert.equal(httpError(500, "boom"), "respondió 500: boom");
  assert.equal(httpError(500, ""), "respondió 500");
});

test("error bodies read as their message, not as raw XML or JSON", () => {
  const cj = `<?xml version="1.0" encoding="UTF-8"?>\n<cj-api><error-message>Website id specified does not match your account: 4120689</error-message></cj-api>`;
  assert.equal(readableBody(cj), "Website id specified does not match your account: 4120689");
  assert.equal(readableBody(`{"error":"invalid_request","error_description":"Bad site"}`), "Bad site");
  assert.equal(readableBody(`{"message":"Nope"}`), "Nope");
  assert.equal(readableBody("plain text"), "plain text");
  assert.equal(readableBody("x".repeat(300)).length, 200);
});

test("a 400 also names the ids the network asks for (CJ: a PID from another account)", () => {
  const cj = { label: "CJ", fields: [{ name: "websiteId", label: "ID del sitio web (PID)", secret: false }, { name: "token", label: "Token", secret: true }] };
  assert.match(networkError(cj, new Error(`x ${httpError(400, "Website id specified does not match your account")}`)), /revisa también ID del sitio web \(PID\)$/);
});

test("a 403 names the ids that network asks for, and none when it only takes a token", () => {
  const tokenOnly = { label: "Tradedoubler", fields: [{ name: "token", label: "Token de Vouchers", secret: true }] };
  const withIds = { label: "Awin", fields: [{ name: "token", label: "API token", secret: true }, { name: "publisherId", label: "Publisher ID", secret: false }] };
  const forbidden = new Error(`api.x.com ${httpError(403, "")}`);
  assert.doesNotMatch(networkError(tokenOnly, forbidden), /ID/);
  assert.match(networkError(tokenOnly, forbidden), /^Tradedoubler: .*\(403\)/);
  assert.match(networkError(withIds, forbidden), /revisa también Publisher ID$/);
  assert.equal(networkError(withIds, new Error("x respondió 500")), "Awin: x respondió 500");
});

test("Awin token works pasted with or without «Bearer»", () => {
  assert.equal(bearer(" Bearer abc-123 "), "Bearer abc-123");
  assert.equal(bearer("abc-123"), "Bearer abc-123");
});

test("Awin: only publisher accounts; the only one is taken, several ask which", () => {
  const accounts = parseAwinAccounts({
    accounts: [
      { accountId: 111, accountName: "Cupones ES", accountType: "publisher" },
      { accountId: 222, accountName: "Tienda", accountType: "advertiser" },
    ],
  });
  assert.deepEqual(accounts, [{ id: "111", name: "Cupones ES" }]);
  assert.equal(pickAwinAccount(accounts), "111");
  const two = [...accounts, { id: "333", name: "Cupones FR" }];
  assert.throws(() => pickAwinAccount(two), /Cupones ES \(111\), Cupones FR \(333\)/);
  assert.throws(() => pickAwinAccount([]), /ninguna cuenta de publisher/);
});
