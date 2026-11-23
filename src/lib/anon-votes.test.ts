import { test } from "node:test";
import assert from "node:assert/strict";
import { ANON_REPORTS_PER_IP_PER_DAY, ANON_VOTERS_PER_IP_PER_DEAL, ANON_VOTES_PER_IP_PER_HOUR, anonReportAllowed, anonVoteAllowed, ipKey, newVoterId, validVoterId, voterKey } from "./anon-votes.ts";

test("voter ids: 32 hex chars, and only those pass", () => {
  const id = newVoterId();
  assert.ok(validVoterId(id));
  assert.notEqual(id, newVoterId());
  for (const bad of [undefined, "", "abc", id.toUpperCase(), `${id}0`, "z".repeat(32)]) assert.equal(validVoterId(bad), false);
});

test("voterKey hides the cookie value and is stable", () => {
  const id = newVoterId();
  assert.equal(voterKey(id), voterKey(id));
  assert.ok(!voterKey(id).includes(id));
  assert.match(voterKey(id), /^[0-9a-f]{64}$/);
});

test("ipKey: same IP same day matches, another day or secret does not, and the IP is not in it", () => {
  const d1 = new Date("2026-11-16T10:00:00Z");
  const d1b = new Date("2026-11-16T23:00:00Z");
  const d2 = new Date("2026-11-17T01:00:00Z");
  assert.equal(ipKey("s", "1.2.3.4", d1), ipKey("s", "1.2.3.4", d1b));
  assert.notEqual(ipKey("s", "1.2.3.4", d1), ipKey("s", "1.2.3.4", d2));
  assert.notEqual(ipKey("s", "1.2.3.4", d1), ipKey("t", "1.2.3.4", d1));
  assert.notEqual(ipKey("s", "1.2.3.4", d1), ipKey("s", "1.2.3.5", d1));
  assert.ok(!ipKey("s", "1.2.3.4", d1).includes("1.2.3.4"));
});

test("anonVoteAllowed: hourly cap per IP, and a few new voters per IP and deal", () => {
  assert.equal(anonVoteAllowed({ ipVotesLastHour: 0, otherVotersOnDeal: 0, alreadyOnDeal: false }), true);
  assert.equal(anonVoteAllowed({ ipVotesLastHour: ANON_VOTES_PER_IP_PER_HOUR, otherVotersOnDeal: 0, alreadyOnDeal: true }), false);
  assert.equal(anonVoteAllowed({ ipVotesLastHour: 1, otherVotersOnDeal: ANON_VOTERS_PER_IP_PER_DEAL - 1, alreadyOnDeal: false }), true);
  assert.equal(anonVoteAllowed({ ipVotesLastHour: 1, otherVotersOnDeal: ANON_VOTERS_PER_IP_PER_DEAL, alreadyOnDeal: false }), false);
  // changing your own vote is never blocked by other voters on the same IP
  assert.equal(anonVoteAllowed({ ipVotesLastHour: 1, otherVotersOnDeal: 10, alreadyOnDeal: true }), true);
});

test("anonReportAllowed: a daily cap per IP and one reporter per IP and deal", () => {
  assert.equal(anonReportAllowed({ ipReportsToday: 0, otherReportersOnDeal: 0 }), true);
  assert.equal(anonReportAllowed({ ipReportsToday: ANON_REPORTS_PER_IP_PER_DAY, otherReportersOnDeal: 0 }), false);
  // a second browser on the same connection can't add the second report that would hide the find
  assert.equal(anonReportAllowed({ ipReportsToday: 1, otherReportersOnDeal: 1 }), false);
});
