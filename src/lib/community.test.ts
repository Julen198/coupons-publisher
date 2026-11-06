import assert from "node:assert/strict";
import { test } from "node:test";
import { byComments, byVotes, cleanComment, EXPIRY_REPORT_LIMIT_PER_DAY, mayHaveExpired, reportLimitReached, cleanHandle, couponIdOf, flagOf, MAX_EMAIL_LENGTH, nextVote, parseSharedDeal, replyParent, usefulLabel, threadComments, timeAgo, validEmail } from "./community.ts";

test("cleanHandle", () => {
  assert.equal(cleanHandle("  Runner_Bilbo "), "runner_bilbo");
  assert.equal(cleanHandle("ab"), null);
  assert.equal(cleanHandle("con espacio"), null);
  assert.equal(cleanHandle("a".repeat(21)), null);
});
test("cleanComment", () => {
  assert.equal(cleanComment("  ok  "), "ok");
  assert.equal(cleanComment("a"), null);
  assert.equal(cleanComment("x".repeat(1001)), null);
  assert.equal(cleanComment("uno\n\n\n\ndos"), "uno\n\ndos");
});
test("nextVote toggles and flips", () => {
  assert.equal(nextVote(0, 1), 1);
  assert.equal(nextVote(1, 1), 0);
  assert.equal(nextVote(1, -1), -1);
  assert.equal(nextVote(-1, -1), 0);
});
test("timeAgo", () => {
  const now = new Date("2026-11-05T12:00:00Z");
  assert.equal(timeAgo(new Date("2026-11-05T11:59:30Z"), now), "hace un momento");
  assert.equal(timeAgo(new Date("2026-11-05T11:15:00Z"), now), "hace 45 min");
  assert.equal(timeAgo(new Date("2026-11-05T09:00:00Z"), now), "hace 3 h");
  assert.equal(timeAgo(new Date("2026-11-04T10:00:00Z"), now), "hace 1 día");
  assert.equal(timeAgo(new Date("2026-11-02T12:00:00Z"), now), "hace 3 días");
});

test("byVotes ranks by score, then checked, then discount, then newest", () => {
  const d = (id: number, score: number, verified = 0, discount = "") => ({ id, score, verified, discount });
  const list = [d(1, 0, 1, "10%"), d(2, 3), d(3, 0, 1, "30%"), d(4, -1, 1), d(5, 0, 0)];
  assert.deepEqual([...list].sort(byVotes).map((x) => x.id), [2, 3, 1, 5, 4]);
});

test("byComments ranks by visible comments, then like Más votados", () => {
  const d = (id: number, comments: number, score = 0) => ({ id, comments, score, verified: 0, discount: "" });
  const list = [d(1, 2), d(2, 5), d(3, 2, 4), d(4, 0, 9), d(5, 2)];
  assert.deepEqual([...list].sort(byComments).map((x) => x.id), [2, 3, 5, 1, 4]);
});

test("cleanComment normalises browser line endings first", () => {
  assert.equal(cleanComment("uno\r\n\r\n\r\n\r\ndos"), "uno\n\ndos");
  assert.equal(cleanComment("uno\rdos"), "uno\ndos");
  assert.equal(cleanComment("a\r\n".repeat(500) + "b"), null);
  assert.equal(cleanComment("a\r\n".repeat(499) + "a"), "a\n".repeat(499) + "a");
});

test("couponIdOf accepts only plain positive ids that fit an integer column", () => {
  assert.equal(couponIdOf("42"), 42);
  assert.equal(couponIdOf("999999999"), 999999999);
  for (const bad of ["", "0", "-1", "1.5", "1e3", " 7", "1234567890", "abc", "007x"]) assert.equal(couponIdOf(bad), null, bad);
});

test("parseSharedDeal validates a reader's deal", () => {
  const stores = new Set(["pccomponentes"]);
  const form = (o: Record<string, string>) => (k: string) => o[k] ?? "";
  const good = { store: "pccomponentes", title: "SSD 2 TB a 129 €", url: "https://www.pccomponentes.com/ssd", code: " ssd10 ", discount: "10%", description: "", expires_at: "2026-12-01" };
  assert.deepEqual(parseSharedDeal(form(good), stores), { ok: true, value: { ...good, code: "SSD10" } });
  assert.equal(parseSharedDeal(form({ ...good, store: "otra" }), stores).ok, false);
  assert.equal(parseSharedDeal(form({ ...good, url: "javascript:alert(1)" }), stores).ok, false);
  assert.equal(parseSharedDeal(form({ ...good, url: "http://x.es" }), stores).ok, false);
  assert.equal(parseSharedDeal(form({ ...good, title: "ab" }), stores).ok, false);
  assert.equal(parseSharedDeal(form({ ...good, expires_at: "mañana" }), stores).ok, false);
  assert.equal(parseSharedDeal(form({ ...good, expires_at: "" }), stores).ok, true);
  assert.equal(parseSharedDeal(form({ ...good, expires_at: "2026-02-31" }), stores).ok, false);
  assert.equal(parseSharedDeal(form({ ...good, code: "A".repeat(41) }), stores).ok, false);
  const spaced = parseSharedDeal(form({ ...good, url: "https://www.pccomponentes.com/ssd 2 tb/ñ" }), stores);
  assert.deepEqual(spaced.ok && spaced.value.url, "https://www.pccomponentes.com/ssd%202%20tb/%C3%B1");
  assert.equal(parseSharedDeal(form({ ...good, url: `https://x.es/${"a".repeat(2040)}` }), stores).ok, false);
  assert.equal(parseSharedDeal(form({ ...good, code: "AB CD" }), stores).ok, false);
  assert.equal(parseSharedDeal(form({ ...good, discount: "x".repeat(41) }), stores).ok, false);
  assert.equal(parseSharedDeal(form({ ...good, description: "x".repeat(501) }), stores).ok, false);
});

test("flagOf only accepts 0 and 1", () => {
  assert.equal(flagOf("1"), 1);
  assert.equal(flagOf("0"), 0);
  assert.equal(flagOf("true"), null);
  assert.equal(flagOf(""), null);
});

test("validEmail checks shape and the 254 character cap", () => {
  assert.equal(validEmail("a@b.co"), true);
  assert.equal(validEmail("no-at.com"), false);
  assert.equal(validEmail("a b@c.co"), false);
  const long = `${"a".repeat(MAX_EMAIL_LENGTH - 5)}@b.co`;
  assert.equal(long.length, MAX_EMAIL_LENGTH);
  assert.equal(validEmail(long), true);
  assert.equal(validEmail(`a${long}`), false);
});

test("replyParent attaches a reply to the top-level comment", () => {
  assert.equal(replyParent(7, null), 7);
  assert.equal(replyParent(9, 7), 7);
});

test("threadComments nests replies one level, oldest first, and keeps replies whose parent is hidden out", () => {
  const rows = [
    { id: 1, parent_id: null },
    { id: 2, parent_id: 1 },
    { id: 3, parent_id: null },
    { id: 4, parent_id: 1 },
    { id: 5, parent_id: 99 },
  ];
  const t = threadComments(rows);
  assert.deepEqual(t.map((x) => x.comment.id), [1, 3]);
  assert.deepEqual(t[0].replies.map((x) => x.id), [2, 4]);
  assert.deepEqual(t[1].replies, []);
});

test("usefulLabel", () => {
  assert.equal(usefulLabel(0), "0 útiles");
  assert.equal(usefulLabel(1), "1 útil");
  assert.equal(usefulLabel(5), "5 útiles");
});

test("mayHaveExpired once three different readers reported the deal", () => {
  assert.equal(mayHaveExpired(0), false);
  assert.equal(mayHaveExpired(2), false);
  assert.equal(mayHaveExpired(3), true);
  assert.equal(mayHaveExpired(12), true);
});

test("reportLimitReached at ten expiry reports a day", () => {
  assert.equal(EXPIRY_REPORT_LIMIT_PER_DAY, 10);
  assert.equal(reportLimitReached(9), false);
  assert.equal(reportLimitReached(10), true);
});
