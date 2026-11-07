import type { Orden } from "./catalog.ts";
import { percentOf, savingOf } from "./site-text.ts";

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
  // browsers submit textareas with CRLF: count and collapse on plain LF
  const body = raw.replace(/\r\n?/g, "\n").trim().replace(/\n{3,}/g, "\n\n");
  return body.length >= COMMENT_MIN && body.length <= COMMENT_MAX ? body : null;
}

// A coupon id from a form field: digits only and small enough for an integer column, so a tampered value can't reach Postgres
export function couponIdOf(raw: string): number | null {
  if (!/^\d{1,9}$/.test(raw)) return null;
  const id = Number(raw);
  return id > 0 ? id : null;
}

// A reply to a reply attaches to the top-level comment: threads are one level deep
export function replyParent(targetId: number, parentOfTarget: number | null): number {
  return parentOfTarget ?? targetId;
}

// Top-level comments in the order given, each with its replies in the order given; replies whose parent is missing are left out
export function threadComments<T extends { id: number; parent_id: number | null }>(rows: readonly T[]): { comment: T; replies: T[] }[] {
  return rows
    .filter((r) => r.parent_id === null)
    .map((comment) => ({ comment, replies: rows.filter((r) => r.parent_id === comment.id) }));
}

export const usefulLabel = (n: number) => (n === 1 ? "1 útil" : `${n} útiles`);

// Pressing the vote you already gave clears it; pressing the other one flips it
export function nextVote(current: VoteValue, pressed: -1 | 1): VoteValue {
  return current === pressed ? 0 : pressed;
}

type Rankable = { score: number; verified: number; discount: string; id: number };

// "Más votados": community score first, then checked by a person, then the biggest discount, then the newest
export function byVotes(a: Rankable, b: Rankable): number {
  return b.score - a.score || b.verified - a.verified || percentOf(b.discount) - percentOf(a.discount) || b.id - a.id;
}

// "Comentados": most visible comments first, ties ranked as in Más votados
export function byComments(a: Rankable & { comments: number }, b: Rankable & { comments: number }): number {
  return b.comments - a.comments || byVotes(a, b);
}

type Sortable = Rankable & { comments: number; expires_at: string | null };

// A feed in the order of the chosen tab (home page and store pages); returns a new list
export function sortDeals<T extends Sortable>(list: readonly T[], orden: Orden): T[] {
  const byId = (a: T, b: T) => b.id - a.id;
  if (orden === "nuevos") return [...list].sort(byId);
  if (orden === "ahorro") return [...list].sort((a, b) => savingOf(b.discount) - savingOf(a.discount) || byId(a, b));
  if (orden === "comentados") return [...list].sort(byComments);
  if (orden === "caducan") return [...list].sort((a, b) => (a.expires_at || "9999").localeCompare(b.expires_at || "9999") || byId(a, b));
  return [...list].sort(byVotes);
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

export type SharedDeal = { store: string; title: string; url: string; code: string; discount: string; description: string; expires_at: string };
export type SharedDealResult = { ok: true; value: SharedDeal } | { ok: false; error: string };

const isRealDate = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) && new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso;

// What a signed-in reader may submit as a deal. https only, since the link ends up behind a "Ir a la oferta" button.
export function parseSharedDeal(get: (k: string) => string, storeSlugs: ReadonlySet<string>): SharedDealResult {
  const text = (k: string) => get(k).replace(/\r\n?/g, "\n").trim();
  const store = text("store");
  const title = text("title");
  const url = text("url");
  const code = text("code").toUpperCase();
  const discount = text("discount");
  const description = text("description");
  const expires_at = text("expires_at");
  if (!storeSlugs.has(store)) return { ok: false, error: "Elige una tienda de la lista." };
  if (title.length < 5 || title.length > 120) return { ok: false, error: "El título debe tener entre 5 y 120 caracteres." };
  const parsed = URL.canParse(url) ? new URL(url) : null;
  if (!parsed || parsed.protocol !== "https:") return { ok: false, error: "El enlace debe ser una dirección https." };
  if (parsed.href.length > 2048) return { ok: false, error: "El enlace es demasiado largo (máximo 2048 caracteres)." };
  if (code.length > 40 || /\s/.test(code)) return { ok: false, error: "El código no puede llevar espacios ni pasar de 40 caracteres." };
  if (discount.length > 40) return { ok: false, error: "El descuento no puede pasar de 40 caracteres." };
  if (description.length > 500) return { ok: false, error: "La descripción no puede pasar de 500 caracteres." };
  if (expires_at && !isRealDate(expires_at)) return { ok: false, error: "La fecha de caducidad no es válida." };
  return { ok: true, value: { store, title, url: parsed.href, code, discount, description, expires_at } };
}

// A 0/1 form flag ("hidden", "blocked"); anything else is rejected rather than guessed
export function flagOf(raw: string): 0 | 1 | null {
  return raw === "1" ? 1 : raw === "0" ? 0 : null;
}

export const MAX_EMAIL_LENGTH = 254;

export const validEmail = (email: string) => email.length <= MAX_EMAIL_LENGTH && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// "Marcar como caducado": from this many reports by different readers a live deal shows "Puede haber caducado"
export const EXPIRY_REPORT_THRESHOLD = 3;
export const mayHaveExpired = (reports: number): boolean => reports >= EXPIRY_REPORT_THRESHOLD;

// Reports one reader may send in 24 hours, so nobody can flag the whole site
export const EXPIRY_REPORT_LIMIT_PER_DAY = 10;
export const reportLimitReached = (sentToday: number): boolean => sentToday >= EXPIRY_REPORT_LIMIT_PER_DAY;
