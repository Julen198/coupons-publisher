import { createHash, createHmac, randomBytes } from "node:crypto";
import { columnGuard } from "./tracking-columns.ts";

// Votes from visitors without an account. Pure pieces, so they test without a database (the vote action keeps the SQL).
//
// Who: a random id in a first-party httpOnly cookie, set only when the visitor presses a vote button (a cookie the
// visitor asks for by voting, needed to remember that vote and to let them change it: no consent banner needed under
// LSSI art. 22.2). The database keeps sha256 of it, never the id itself.
// Abuse: the cookie can be cleared, so each vote also carries a per-day HMAC of the IP (keyed by SESSION_SECRET and the
// date, so the same IP on two days gives unrelated values and nobody can read the IP back). It only feeds the two limits
// below and the clicks cron blanks it after two days.

export const VOTER_COOKIE = "cl_voter";
export const VOTER_MAX_AGE = 60 * 60 * 24 * 365;

// Vote presses one IP may make in an hour, across all deals (a script hammering the buttons)
export const ANON_VOTES_PER_IP_PER_HOUR = 60;
// Different "voters" (cookies) one IP may add to the same deal in 24 hours: a household or an office shares an IP,
// someone clearing cookies to vote again on one deal stops here
export const ANON_VOTERS_PER_IP_PER_DEAL = 3;

export const newVoterId = (): string => randomBytes(16).toString("hex");
export const validVoterId = (raw: string | undefined): raw is string => !!raw && /^[0-9a-f]{32}$/.test(raw);
export const voterKey = (id: string): string => createHash("sha256").update(`anon-voter.${id}`).digest("hex");

export function ipKey(secret: string, ip: string, now: Date): string {
  const day = now.toISOString().slice(0, 10);
  return createHmac("sha256", secret).update(`anon-vote-ip.${day}.${ip}`).digest("hex").slice(0, 32);
}

// alreadyOnDeal: this voter already has a vote on the deal (changing or clearing it never counts as a new voter)
export function anonVoteAllowed(c: { ipVotesLastHour: number; otherVotersOnDeal: number; alreadyOnDeal: boolean }): boolean {
  if (c.ipVotesLastHour >= ANON_VOTES_PER_IP_PER_HOUR) return false;
  return c.alreadyOnDeal || c.otherVotersOnDeal < ANON_VOTERS_PER_IP_PER_DEAL;
}

// anon_votes arrives with a migration (SCHEMA_SQL / sql in the project files): until it exists, scores leave it out
// and anonymous votes are not taken, instead of failing the page
export const anonVotesTable = columnGuard(/\banon_votes\b/);
