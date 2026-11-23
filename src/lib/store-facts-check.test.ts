import { test } from "node:test";
import assert from "node:assert/strict";
import { digestOf, factSources, FAILS_TO_REPORT, nextCheck, pageText, policySentences, readOutcome, sentenceDiff, type FetchOutcome } from "./store-facts-check.ts";

test("factSources groups the labels by page and skips lines without an http(s) URL", () => {
  const text = "Envío | https://shop.es/envios\nDevoluciones | https://shop.es/envios\nFormas de pago | ver web\nCódigos por pedido | javascript:alert(1)\nsin barra";
  assert.deepEqual(factSources(text), [{ url: "https://shop.es/envios", labels: ["Envío", "Devoluciones"] }]);
});

test("pageText drops scripts and tags and decodes entities", () => {
  const html = "<html><script>var x = 'Envío gratis 1 €'</script><style>p{}</style><p>Env&iacute;o gratis desde 50&nbsp;&euro;</p><div>Otra&#32;línea</div></html>";
  assert.equal(pageText(html), "Envío gratis desde 50 €\nOtra línea");
});

const PAGE = `<main><h1>Envíos</h1>
<p>Envío estándar 4,99 €. Gratis en pedidos desde 50 €. Nuestro equipo te atiende con una sonrisa.</p>
<p>Tienes 30 días para devolver tu pedido. La devolución cuesta 3,99 €.</p>
<p>Aceptamos tarjeta, PayPal y Bizum.</p><p>Solo se puede usar un código por pedido.</p></main>`;

test("policySentences keeps the sentences of the requested facts that state something", () => {
  assert.deepEqual(policySentences(PAGE, ["Envío"]), ["Envío estándar 4,99 €.", "Gratis en pedidos desde 50 €."]);
  assert.deepEqual(policySentences(PAGE, ["Devoluciones"]), ["Tienes 30 días para devolver tu pedido.", "La devolución cuesta 3,99 €."]);
  assert.deepEqual(policySentences(PAGE, ["Formas de pago"]), ["Aceptamos tarjeta, PayPal y Bizum."]);
  assert.deepEqual(policySentences(PAGE, ["Códigos por pedido"]), ["Solo se puede usar un código por pedido."]);
});

test("digestOf ignores case, spacing and order, not figures", () => {
  assert.equal(digestOf(["Gratis desde 50 €.", "Envío 4,99 €"]), digestOf(["envío  4,99 €", "gratis desde 50 €"]));
  assert.notEqual(digestOf(["Gratis desde 50 €."]), digestOf(["Gratis desde 60 €."]));
});

test("readOutcome tells a bot wall and an empty page from a good read", () => {
  assert.equal(readOutcome(403, "", ["Envío"]).kind, "blocked");
  assert.equal(readOutcome(404, "", ["Envío"]).kind, "error");
  assert.equal(readOutcome(200, "<p>Please complete the captcha</p>", ["Envío"]).kind, "blocked");
  assert.equal(readOutcome(200, "<div id=root></div>", ["Envío"]).kind, "empty");
  const ok = readOutcome(200, PAGE, ["Envío"]);
  assert.equal(ok.kind, "ok");
});

const ok = (sentences: string[]): FetchOutcome => ({ kind: "ok", sentences, digest: digestOf(sentences) });
const fail: FetchOutcome = { kind: "blocked", detail: "HTTP 403" };

test("nextCheck: first read is the baseline, a different one is a change that keeps the old text", () => {
  const first = nextCheck(null, ok(["Gratis desde 50 €"]));
  assert.equal(first.news, null);
  assert.equal(first.next.status, "ok");
  const same = nextCheck(first.next, ok(["gratis desde 50 €"]));
  assert.equal(same.news, null);
  const changed = nextCheck(same.next, ok(["Gratis desde 60 €"]));
  assert.equal(changed.news, "changed");
  assert.equal(changed.next.status, "changed");
  assert.deepEqual(changed.next.previous, ["Gratis desde 50 €"]);
  // changes again before review: still "changed", still compared with the text from before the first change, notified again
  const again = nextCheck(changed.next, ok(["Gratis desde 70 €"]));
  assert.equal(again.news, "changed");
  assert.deepEqual(again.next.previous, ["Gratis desde 50 €"]);
  // the same text the next day: nothing new, still waiting for review
  const still = nextCheck(again.next, ok(["Gratis desde 70 €"]));
  assert.equal(still.news, null);
  assert.equal(still.next.status, "changed");
});

test("nextCheck: failures only count after a few in a row, and are reported once", () => {
  let s = nextCheck(null, ok(["Gratis desde 50 €"])).next;
  for (let i = 1; i < FAILS_TO_REPORT; i++) {
    const step = nextCheck(s, fail);
    assert.equal(step.news, null);
    assert.equal(step.next.status, "ok");
    s = step.next;
  }
  const reported = nextCheck(s, fail);
  assert.equal(reported.news, "unreadable");
  assert.equal(reported.next.status, "unreadable");
  assert.equal(nextCheck(reported.next, fail).news, null);
  // readable again, same text: back to ok without a notice
  const back = nextCheck(reported.next, ok(["Gratis desde 50 €"]));
  assert.equal(back.news, null);
  assert.equal(back.next.status, "ok");
  assert.equal(back.next.fails, 0);
});

test("nextCheck: a failure never hides a change waiting for review", () => {
  const changed = nextCheck(nextCheck(null, ok(["A 1 €"])).next, ok(["A 2 €"])).next;
  let s = changed;
  for (let i = 0; i < FAILS_TO_REPORT + 1; i++) s = nextCheck(s, fail).next;
  assert.equal(s.status, "changed");
});

test("sentenceDiff lists what appeared and what went away", () => {
  assert.deepEqual(sentenceDiff(["Gratis desde 50 €.", "Devolución 30 días."], ["gratis desde 60 €", "Devolución 30 días"]), {
    added: ["gratis desde 60 €"],
    removed: ["Gratis desde 50 €."],
  });
});
