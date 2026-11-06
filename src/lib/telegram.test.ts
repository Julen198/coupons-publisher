import { test } from "node:test";
import assert from "node:assert/strict";
import { channelUrl, dealMessage, hashtag, parseCallback, promptCouponId, reviewKeyboard } from "./telegram.ts";

test("channel join link comes from a public @username only", () => {
  assert.equal(channelUrl("@cuponlabchollos"), "https://t.me/cuponlabchollos");
  assert.equal(channelUrl("-1001234567890"), null);
  assert.equal(channelUrl(""), null);
  assert.equal(channelUrl(undefined), null);
});

const deal = {
  id: 42,
  kind: "code" as const,
  title: "15% extra en <rebajas> & más",
  code: "CLAB15",
  discount: "15%",
  expires_at: "2026-11-30",
  store_name: "El Corte Inglés",
};
const links = { url: "https://cuponlab.es/chollos/42-x?utm_source=telegram", channel: "@cuponlabchollos", site: "cuponlab.es" };

test("store hashtag keeps only letters and digits", () => {
  assert.equal(hashtag("El Corte Inglés"), "#elcorteingles");
  assert.equal(hashtag("43einhalb"), "#43einhalb");
});

test("deal message follows the channel layout: headline, hashtag, title, code, link, footer", () => {
  const text = dealMessage(deal, links);
  assert.match(text, /^💥 <b>EL CORTE INGLÉS: 15%<\/b> ❗\n#elcorteingles\n\n/);
  assert.match(text, /15% extra en &lt;rebajas&gt; &amp; más/);
  assert.match(text, /🏷 Código: <code>CLAB15<\/code>/);
  assert.match(text, /30 de noviembre de 2026/);
  assert.match(text, /➡️ <a href="https:\/\/cuponlab\.es\/chollos\/42-x\?utm_source=telegram">cuponlab\.es\/chollos\/42<\/a>/);
  assert.match(text, /📣 Síguenos: @cuponlabchollos\n🌍 cuponlab\.es$/);
});

test("deal message: title override, no code or expiry lines when missing, no follow line without channel", () => {
  const text = dealMessage({ ...deal, kind: "deal", code: "", expires_at: "", discount: "" }, { ...links, channel: null }, "Título nuevo");
  assert.match(text, /Título nuevo/);
  assert.match(text, /<b>EL CORTE INGLÉS: OFERTA<\/b>/);
  assert.doesNotMatch(text, /<code>|Válido|Síguenos/);
});

test("callback data round-trips through the review keyboard", () => {
  const buttons = reviewKeyboard(42).inline_keyboard.flat().map((b) => b.callback_data);
  assert.deepEqual(buttons.map(parseCallback), [
    { action: "pub", id: 42 },
    { action: "edit", id: 42 },
    { action: "del", id: 42 },
  ]);
  assert.equal(parseCallback("pub:abc"), null);
  assert.equal(parseCallback("hack:1"), null);
  assert.equal(parseCallback(undefined), null);
});

test("edit prompt carries the coupon id", () => {
  assert.equal(promptCouponId("✏️ Responde con el título para el canal (#42)"), 42);
  assert.equal(promptCouponId("hola"), null);
  assert.equal(promptCouponId(undefined), null);
});
