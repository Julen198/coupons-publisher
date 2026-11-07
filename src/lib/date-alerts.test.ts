import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DATE_ALERT_LEAD_DAYS, alertDeals, dateAlertEmail, eventKey, eventsDueOn, signUnsubscribe, unsubscribeUrl, verifyUnsubscribe,
} from "./date-alerts.ts";

test("eventsDueOn returns the calendar dates exactly two days ahead", () => {
  assert.equal(DATE_ALERT_LEAD_DAYS, 2);
  assert.deepEqual(eventsDueOn("2026-11-25").map((e) => e.name), ["Black Friday 2026"]);
  assert.deepEqual(eventsDueOn("2026-11-28").map((e) => e.name), ["Cyber Monday"]);
  assert.deepEqual(eventsDueOn("2026-11-26"), []);
  assert.deepEqual(eventsDueOn("2026-11-27"), []);
  assert.deepEqual(eventsDueOn("2026-12-23").map((e) => e.date), ["2026-12-25"]);
});

test("eventsDueOn crosses the year end", () => {
  assert.deepEqual(eventsDueOn("2027-01-04").map((e) => e.date), ["2027-01-06"]);
  assert.deepEqual(eventsDueOn("2026-12-31"), []);
  // two days after Dec 30 is Jan 1: nothing on the calendar, and no crash on the year change
  assert.deepEqual(eventsDueOn("2026-12-30"), []);
});

test("eventKey is stable per date and name", () => {
  assert.equal(eventKey({ date: "2026-11-27", name: "Black Friday 2026", note: "x" }), "2026-11-27|Black Friday 2026");
});

test("unsubscribe tokens verify only with the same secret and reader", () => {
  const t = signUnsubscribe("s3cret", 42);
  assert.match(t, /^42\.[0-9a-f]{64}$/);
  assert.equal(verifyUnsubscribe("s3cret", t), 42);
  assert.equal(verifyUnsubscribe("other", t), null);
  assert.equal(verifyUnsubscribe("s3cret", t.replace(/^42/, "43")), null);
  assert.equal(verifyUnsubscribe("s3cret", `${t}0`), null);
  assert.equal(verifyUnsubscribe("s3cret", ""), null);
  assert.equal(verifyUnsubscribe(undefined, t), null);
  assert.equal(verifyUnsubscribe("s3cret", null), null);
  assert.equal(verifyUnsubscribe("s3cret", "0.".padEnd(66, "a")), null);
});

test("unsubscribeUrl points at the baja route with the token", () => {
  const t = signUnsubscribe("s", 7);
  assert.equal(unsubscribeUrl("https://cuponlab.es", "s", 7), `https://cuponlab.es/api/date-alerts/baja?t=${t}`);
});

test("alertDeals picks the five best by votes, without changing the list", () => {
  const list = [1, 2, 3, 4, 5, 6, 7].map((id) => ({ id, score: id === 3 ? 50 : id, verified: 0, discount: "", comments: 0, expires_at: null }));
  const top = alertDeals(list);
  assert.deepEqual(top.map((d) => d.id), [3, 7, 6, 5, 4]);
  assert.deepEqual(list.map((d) => d.id), [1, 2, 3, 4, 5, 6, 7]);
});

const event = { date: "2026-11-27", name: "Black Friday 2026", note: "Muchas tiendas adelantan ofertas toda la semana" };
const deal = (n: number) => ({ id: n, title: `Chollo <${n}>`, display_title: `Chollo <${n}>`, store_name: "Nike", discount: "20%" });

test("dateAlertEmail names the date and links up to five deals to their pages", () => {
  const mail = dateAlertEmail({ event, deals: [1, 2, 3, 4, 5, 6].map(deal), base: "https://cuponlab.es", unsubscribe: "https://cuponlab.es/api/date-alerts/baja?t=1.ab" });
  assert.equal(mail.subject, "Black Friday 2026 es en 2 días: los mejores chollos");
  assert.match(mail.text, /viernes 27 de noviembre de 2026/);
  assert.match(mail.text, /https:\/\/cuponlab\.es\/chollos\/1-nike-chollo-1/);
  assert.doesNotMatch(mail.text, /chollos\/6-/);
  assert.equal((mail.html.match(/href="https:\/\/cuponlab\.es\/chollos\//g) ?? []).length, 5);
  assert.match(mail.html, /Chollo &#60;1&#62;/);
  assert.doesNotMatch(mail.html, /Chollo <1>/);
  assert.match(mail.text, /Darte de baja: https:\/\/cuponlab\.es\/api\/date-alerts\/baja\?t=1\.ab/);
  assert.match(mail.html, /href="https:\/\/cuponlab\.es\/api\/date-alerts\/baja\?t=1\.ab"/);
  assert.equal(mail.headers?.["List-Unsubscribe"], "<https://cuponlab.es/api/date-alerts/baja?t=1.ab>");
  assert.equal(mail.headers?.["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
});

test("dateAlertEmail without live deals still sends the date, pointing at the home page", () => {
  const mail = dateAlertEmail({ event, deals: [], base: "https://cuponlab.es", unsubscribe: "https://cuponlab.es/x" });
  assert.match(mail.text, /https:\/\/cuponlab\.es\/\n/);
  assert.doesNotMatch(mail.html, /chollos\//);
});
