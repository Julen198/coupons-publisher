import assert from "node:assert/strict";
import { test } from "node:test";
import { missingEmailConfig, readerLinkEmail } from "./email.ts";

test("missingEmailConfig: names the Resend settings that are unset or blank, never their values", () => {
  assert.deepEqual(missingEmailConfig({ RESEND_API_KEY: "re_x", RESEND_FROM: "CuponLab <hola@cuponlab.es>" }), []);
  assert.deepEqual(missingEmailConfig({}), ["RESEND_API_KEY", "RESEND_FROM"]);
  assert.deepEqual(missingEmailConfig({ RESEND_API_KEY: "re_x" }), ["RESEND_FROM"]);
  assert.deepEqual(missingEmailConfig({ RESEND_API_KEY: " ", RESEND_FROM: "a@b.es" }), ["RESEND_API_KEY"]);
});

test("readerLinkEmail: the board's email, as HTML tables with inline styles plus a plain-text part", () => {
  const link = "https://cuponlab.es/entrar/confirmar?token=abc&next=%2Ftiendas";
  const mail = readerLinkEmail(link);
  assert.equal(mail.subject, "Tu enlace para entrar en CuponLab");
  const body = "Pulsa el botón para entrar. El enlace sirve una vez y caduca en 15 minutos.";
  const footer = "Si no lo has pedido tú, ignora este email. Nadie puede entrar sin él.";
  assert.equal(mail.text, `${body}\n\nEntrar en CuponLab:\n${link}\n\n${footer}`);
  assert.match(mail.html, /^<!doctype html>/);
  assert.match(mail.html, /<table role="presentation"/);
  assert.ok(mail.html.includes(body) && mail.html.includes(footer));
  assert.ok(mail.html.includes(`href="https://cuponlab.es/entrar/confirmar?token=abc&#38;next=%2Ftiendas"`));
  assert.match(mail.html, />Entrar en CuponLab</);
  assert.match(mail.html, /Cupon<span style="[^"]*color:#1d4ed8[^"]*">Lab<\/span>/);
  assert.doesNotMatch(mail.html, /class=|<style/);
  assert.doesNotMatch(mail.html, /\u2014/);
});

test("readerLinkEmail escapes the link", () => {
  assert.ok(readerLinkEmail('https://x.es/?a="><b>').html.includes("&#34;&#62;&#60;b&#62;"));
});

test("explainEmailError: turns Resend's answers into the setting to fix", async () => {
  const { explainEmailError } = await import("./email.ts");
  const ok = { RESEND_API_KEY: "re_x", RESEND_FROM: "CuponLab <hola@cuponlab.com>" };
  assert.match(explainEmailError("anything", {}), /Falta RESEND_API_KEY/);
  assert.match(explainEmailError('Resend 403: {"message":"You can only send testing emails to your own email address (a@b.es)."}', { RESEND_API_KEY: "re_x" }), /RESEND_FROM/);
  assert.match(explainEmailError('Resend 403: {"message":"The cuponlab.com domain is not verified."}', ok), /hola@cuponlab\.com.*no está verificado/);
  assert.match(explainEmailError('Resend 401: {"message":"API key is invalid"}', ok), /no es válida/);
  assert.match(explainEmailError("Resend 429: too many", ok), /límite/);
  assert.equal(explainEmailError("Resend 500: boom", ok), "Resend 500: boom");
});
