"use server";

import { refresh } from "next/cache";
import type postgres from "postgres";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { cleanComment, cleanHandle, couponIdOf, flagOf, parseSharedDeal, replyParent, reportLimitReached, validEmail, EXPIRY_REPORT_LIMIT_PER_DAY } from "@/lib/community";
import { appUrl, hashToken, MAGIC_LINK_COOLDOWN_SECONDS, MAGIC_LINK_MINUTES, readerLinkEmail, sendEmail } from "@/lib/email";
import { str, type FormState } from "@/lib/form";
import { newToken } from "@/lib/password";
import { siteCoupon } from "@/lib/public-site";
import { getReader } from "@/lib/reader";
import { READER_COOKIE, SESSION_MAX_AGE, safeNext, signReader } from "@/lib/session";

// Links sent across all readers in the window before we stop sending (a bot could otherwise use us as an email cannon)
const GLOBAL_LINK_LIMIT = 30;
const GLOBAL_LINK_WINDOW_MINUTES = 10;

// Same answer for any valid email (new, known, blocked, or inside the cooldown), so the form can't probe who has an account
export async function requestReaderLink(_prev: FormState, f: FormData): Promise<FormState & { sent?: boolean }> {
  const email = str(f, "email").toLowerCase();
  if (!validEmail(email)) return { error: "Escribe un email válido." };
  const token = newToken();
  try {
    const [recent] = await sql()<{ n: number }[]>`
      SELECT count(*)::int AS n FROM readers WHERE link_sent_at > now() - ${GLOBAL_LINK_WINDOW_MINUTES} * interval '1 minute'`;
    if (recent.n > GLOBAL_LINK_LIMIT) {
      console.error("[reader-link] global limit reached");
      return { sent: true };
    }
    const [reader] = await sql()<{ id: number }[]>`
      INSERT INTO readers (email, login_token_hash, login_expires_at, link_sent_at)
      VALUES (${email}, ${hashToken(token)}, now() + ${MAGIC_LINK_MINUTES} * interval '1 minute', now())
      ON CONFLICT (email) DO UPDATE SET
        login_token_hash = EXCLUDED.login_token_hash, login_expires_at = EXCLUDED.login_expires_at, link_sent_at = now()
      WHERE readers.status = 'active'
        AND (readers.link_sent_at IS NULL OR readers.link_sent_at < now() - ${MAGIC_LINK_COOLDOWN_SECONDS} * interval '1 second')
      RETURNING id`;
    if (reader) {
      const link = `${appUrl()}/entrar/confirmar?token=${token}&next=${encodeURIComponent(safeNext(str(f, "next"), "/"))}`;
      await sendEmail(email, readerLinkEmail(link));
    }
  } catch (e) {
    console.error("[reader-link]", e);
  }
  return { sent: true };
}

// POST (button on /entrar/confirmar), not GET: mail scanners that prefetch links would burn the token
export async function confirmReaderLink(f: FormData): Promise<void> {
  const token = str(f, "token");
  const next = str(f, "next");
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Falta SESSION_SECRET en el servidor");
  const [reader] = /^[0-9a-f]{64}$/.test(token)
    ? await sql()<{ id: number; session_version: number; handle: string | null }[]>`
        UPDATE readers SET login_token_hash = NULL, login_expires_at = NULL
        WHERE login_token_hash = ${hashToken(token)} AND login_expires_at > now() AND status = 'active'
        RETURNING id, session_version, handle`
    : [];
  if (!reader) redirect(`/entrar/confirmar?invalid=1`);
  (await cookies()).set(READER_COOKIE, await signReader(secret, reader.id, reader.session_version), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  const target = safeNext(next, "/");
  redirect(reader.handle ? target : `/entrar/nombre?next=${encodeURIComponent(target)}`);
}

export async function chooseHandle(_prev: FormState, f: FormData): Promise<FormState> {
  const reader = await getReader();
  if (!reader) redirect("/entrar");
  if (reader.handle) redirect(safeNext(str(f, "next"), "/"));
  const handle = cleanHandle(str(f, "handle"));
  if (!handle) return { error: "Usa de 3 a 20 letras, números o guiones bajos" };
  try {
    await sql()`UPDATE readers SET handle = ${handle} WHERE id = ${reader.id} AND handle IS NULL`;
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return { error: "Ese nombre ya está cogido" };
    throw e;
  }
  redirect(safeNext(str(f, "next"), "/"));
}

// Bumping session_version revokes the signed cookie, so a copy of it stops working too (and the reader's other devices sign out)
export async function signOutReader(): Promise<void> {
  const reader = await getReader();
  if (reader) await sql()`UPDATE readers SET session_version = session_version + 1 WHERE id = ${reader.id} AND session_version = ${reader.session_version}`;
  (await cookies()).delete(READER_COOKIE);
  redirect("/");
}

// Per-reader checks (cooldown, daily limits, vote toggle) run inside a transaction holding this advisory lock, so two
// concurrent requests from the same reader take turns instead of both passing the check. One key space per action.
const LOCK = { vote: 1, comment: 2, share: 3, expiry: 4 } as const;

async function asReader<T>(scope: keyof typeof LOCK, readerId: number, run: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return (await sql().begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${LOCK[scope]}, ${readerId})`;
    return run(tx);
  })) as T;
}

// Works without client JS: a plain form post. Signed-out readers go to sign in and come back.
export async function vote(f: FormData): Promise<void> {
  const next = safeNext(str(f, "next"), "/");
  const reader = await getReader();
  if (!reader) redirect(`/entrar?next=${encodeURIComponent(next)}`);
  const couponId = couponIdOf(str(f, "coupon_id"));
  const pressed = str(f, "value") === "1" ? 1 : str(f, "value") === "-1" ? -1 : 0;
  if (!couponId || !pressed) return;
  const found = await siteCoupon(couponId);
  if (!found?.live) return;
  // pressing the vote you already gave clears it, otherwise it is set (nextVote): one statement, under the reader's lock
  await asReader("vote", reader.id, (tx) => tx`
    WITH cleared AS (DELETE FROM votes WHERE reader_id = ${reader.id} AND coupon_id = ${couponId} AND value = ${pressed} RETURNING 1)
    INSERT INTO votes (reader_id, coupon_id, value)
    SELECT ${reader.id}, ${couponId}, ${pressed} WHERE NOT EXISTS (SELECT 1 FROM cleared)
    ON CONFLICT (reader_id, coupon_id) DO UPDATE SET value = EXCLUDED.value, at = now()`);
  refresh();
}

const COMMENT_COOLDOWN_SECONDS = 30;

export async function postComment(_prev: FormState, f: FormData): Promise<FormState & { posted?: boolean }> {
  const reader = await getReader();
  if (!reader) return { error: "Entra para comentar" };
  if (!reader.handle) redirect("/entrar/nombre");
  const couponId = couponIdOf(str(f, "coupon_id"));
  const found = couponId ? await siteCoupon(couponId) : undefined;
  if (!found?.live) return { error: "Este chollo ya no admite comentarios" };
  // raw value, not str(): str() trims, and cleanComment owns the trimming
  const body = cleanComment(String(f.get("body") ?? ""));
  if (!body) return { error: "Escribe entre 2 y 1000 caracteres" };
  // a reply points at a visible comment of this same coupon; replying to a reply joins the top-level thread
  const rawParent = str(f, "parent_id");
  let parentId: number | null = null;
  if (rawParent) {
    const target = couponIdOf(rawParent);
    const [row] = target
      ? await sql()<{ id: number; parent_id: number | null }[]>`
          SELECT k.id, k.parent_id FROM comments k JOIN readers r ON r.id = k.reader_id
          LEFT JOIN comments pk ON pk.id = k.parent_id LEFT JOIN readers pr ON pr.id = pk.reader_id
          WHERE k.id = ${target} AND k.coupon_id = ${found.coupon.id} AND k.hidden = 0 AND r.status = 'active'
            AND (k.parent_id IS NULL OR (pk.hidden = 0 AND pr.status = 'active'))`
      : [];
    if (!row) return { error: "Ese comentario ya no existe" };
    parentId = replyParent(row.id, row.parent_id);
  }
  const inserted = await asReader("comment", reader.id, (tx) => tx`
    INSERT INTO comments (coupon_id, reader_id, body, parent_id)
    SELECT ${found.coupon.id}, ${reader.id}, ${body}, ${parentId}
    WHERE NOT EXISTS (
      SELECT 1 FROM comments WHERE reader_id = ${reader.id} AND created_at > now() - ${COMMENT_COOLDOWN_SECONDS} * interval '1 second')
    RETURNING id`);
  if (!inserted.length) return { error: "Espera unos segundos antes de volver a comentar" };
  // a reply form is a page of its own (?responder=): go back to the thread, which also closes the form
  if (parentId) redirect(safeNext(str(f, "next"), "/"));
  refresh();
  return { posted: true };
}

// Works without client JS. Signed-out readers go to sign in and come back; you can't mark your own comment.
export async function toggleHelpful(f: FormData): Promise<void> {
  const next = safeNext(str(f, "next"), "/");
  const reader = await getReader();
  if (!reader) redirect(`/entrar?next=${encodeURIComponent(next)}`);
  const commentId = couponIdOf(str(f, "comment_id"));
  if (!commentId) return;
  const [comment] = await sql()<{ coupon_id: number; reader_id: number }[]>`
    SELECT k.coupon_id, k.reader_id FROM comments k JOIN readers r ON r.id = k.reader_id
    LEFT JOIN comments pk ON pk.id = k.parent_id LEFT JOIN readers pr ON pr.id = pk.reader_id
    WHERE k.id = ${commentId} AND k.hidden = 0 AND r.status = 'active'
      AND (k.parent_id IS NULL OR (pk.hidden = 0 AND pr.status = 'active'))`;
  if (!comment || comment.reader_id === reader.id) return;
  const found = await siteCoupon(comment.coupon_id);
  if (!found?.live) return;
  const removed = await sql()`DELETE FROM comment_votes WHERE reader_id = ${reader.id} AND comment_id = ${commentId} RETURNING comment_id`;
  if (removed.length === 0) {
    await sql()`INSERT INTO comment_votes (reader_id, comment_id) VALUES (${reader.id}, ${commentId}) ON CONFLICT DO NOTHING`;
  }
  refresh();
}

const SHARE_LIMIT_PER_DAY = 5;

// Stored hidden (archived + pending) until an editor publishes it
export async function shareDeal(_prev: FormState, f: FormData): Promise<FormState & { done?: boolean }> {
  const reader = await getReader();
  if (!reader) return { error: "Entra para compartir un chollo" };
  if (!reader.handle) redirect("/entrar/nombre?next=/compartir");
  const stores = await sql()<{ id: number; slug: string }[]>`SELECT id, slug FROM stores`;
  const parsed = parseSharedDeal((k) => String(f.get(k) ?? ""), new Set(stores.map((s) => s.slug)));
  if (!parsed.ok) return { error: parsed.error };
  const d = parsed.value;
  const storeId = stores.find((s) => s.slug === d.store)?.id;
  if (!storeId) return { error: "Elige una tienda de la lista." };
  const inserted = await asReader("share", reader.id, (tx) => tx`
    INSERT INTO coupons (store_id, kind, title, code, discount, description, target_url, expires_at, source, verified, archived, review, shared_by)
    SELECT ${storeId}, ${d.code ? "code" : "deal"}, ${d.title}, ${d.code}, ${d.discount}, ${d.description}, ${d.url}, ${d.expires_at},
           'manual', 0, 1, 'pending', ${reader.id}
    WHERE (SELECT count(*) FROM coupons WHERE shared_by = ${reader.id} AND created_at > now() - interval '24 hours') < ${SHARE_LIMIT_PER_DAY}
    RETURNING id`);
  if (!inserted.length) return { error: "Has compartido 5 chollos hoy. Vuelve mañana" };
  return { done: true };
}

// "Guardar" / "Guardado". `next` is the state the button asks for (1 save, 0 remove), so a double click can't flip it back.
// Saving needs a live deal; removing works on any (the account page lists expired saved deals too).
export async function toggleSaved(f: FormData): Promise<void> {
  const back = safeNext(str(f, "back"), "/");
  const reader = await getReader();
  if (!reader) redirect(`/entrar?next=${encodeURIComponent(back)}`);
  const couponId = couponIdOf(str(f, "coupon_id"));
  const save = flagOf(str(f, "next"));
  if (!couponId || save === null) return;
  if (save === 0) {
    await sql()`DELETE FROM saved_deals WHERE reader_id = ${reader.id} AND coupon_id = ${couponId}`;
  } else {
    const found = await siteCoupon(couponId);
    if (!found?.live) return;
    await sql()`INSERT INTO saved_deals (reader_id, coupon_id) VALUES (${reader.id}, ${couponId}) ON CONFLICT DO NOTHING`;
  }
  refresh();
}

// "Marcar como caducado": one report per reader and deal (the primary key), ten a day per reader
export async function reportExpired(_prev: FormState & { done?: boolean }, f: FormData): Promise<FormState & { done?: boolean }> {
  const back = safeNext(str(f, "back"), "/");
  const reader = await getReader();
  if (!reader) redirect(`/entrar?next=${encodeURIComponent(back)}`);
  const couponId = couponIdOf(str(f, "coupon_id"));
  const found = couponId ? await siteCoupon(couponId) : undefined;
  if (!found?.live) return { error: "Este chollo ya no está activo" };
  const limited = await asReader("expiry", reader.id, async (tx) => {
    const [today] = await tx<{ n: number }[]>`
      SELECT count(*)::int AS n FROM expiry_reports WHERE reader_id = ${reader.id} AND at > now() - interval '24 hours'`;
    if (reportLimitReached(today.n)) return true;
    await tx`INSERT INTO expiry_reports (reader_id, coupon_id) VALUES (${reader.id}, ${found.coupon.id}) ON CONFLICT DO NOTHING`;
    return false;
  });
  if (limited) return { error: `Ya has avisado de ${EXPIRY_REPORT_LIMIT_PER_DAY} chollos hoy. Vuelve mañana` };
  refresh();
  return { done: true };
}
