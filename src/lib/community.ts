import { percentOf } from "./site-text.ts";

// Input rules for the reader community: handles, comments, votes. Pure, so they test without a database.

const HANDLE = /^[a-z0-9_]{3,20}$/;
const COMMENT_MIN = 2;
const COMMENT_MAX = 1000;

export type VoteValue = -1 | 0 | 1;

export function cleanHandle(raw: string): string | null {
  const handle = raw.trim().toLowerCase();
  return HANDLE.test(handle) ? handle : null;
}

export function cleanComment(raw: string): string | null {
  const body = raw.trim().replace(/\n{3,}/g, "\n\n");
  return body.length >= COMMENT_MIN && body.length <= COMMENT_MAX ? body : null;
}

// Pressing the vote you already gave clears it; pressing the other one flips it
export function nextVote(current: VoteValue, pressed: -1 | 1): VoteValue {
  return current === pressed ? 0 : pressed;
}

type Rankable = { score: number; verified: number; discount: string; id: number };

// "Más votados": community score first, then checked by a person, then the biggest discount, then the newest
export function byVotes(a: Rankable, b: Rankable): number {
  return b.score - a.score || b.verified - a.verified || percentOf(b.discount) - percentOf(a.discount) || b.id - a.id;
}

export function timeAgo(from: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - from.getTime()) / 60_000);
  if (minutes < 1) return "hace un momento";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "hace 1 día" : `hace ${days} días`;
}
