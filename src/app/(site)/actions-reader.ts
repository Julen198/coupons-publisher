"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { cleanComment, cleanHandle, couponIdOf, nextVote, parseSharedDeal, type VoteValue } from "@/lib/community";
import { appUrl, hashToken, MAGIC_LINK_COOLDOWN_SECONDS, MAGIC_LINK_MINUTES, readerLinkEmail, sendEmail } from "@/lib/email";
import { str, type FormState } from "@/lib/form";
import { newToken } from "@/lib/password";
import { siteCoupon } from "@/lib/public-site";
import { getReader } from "@/lib/reader";
import { READER_COOKIE, SESSION_MAX_AGE, safeNext, signReader } from "@/lib/session";

// Same answer for any valid email (new, known, blocked, or inside the cooldown), so the form can't probe who has an account
export async function requestReaderLink(_prev: FormState, f: FormData): Promise<FormState & { sent?: boolean }> {
  const email = str(f, "email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Escribe un email válido." };
  const token = newToken();
  try {
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
    await sql()`UPDATE readers SET handle = ${handle} WHERE id = ${reader.id}`;
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return { error: "Ese nombre ya está cogido" };
    throw e;
  }
  redirect(safeNext(str(f, "next"), "/"));
}

export async function signOutReader(): Promise<void> {
  (await cookies()).delete(READER_COOKIE);
  redirect("/");
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
  const [row] = await sql()<{ value: number }[]>`SELECT value FROM votes WHERE reader_id = ${reader.id} AND coupon_id = ${couponId}`;
  const value = nextVote((row?.value ?? 0) as VoteValue, pressed);
  if (value === 0) {
    await sql()`DELETE FROM votes WHERE reader_id = ${reader.id} AND coupon_id = ${couponId}`;
  } else {
    await sql()`
      INSERT INTO votes (reader_id, coupon_id, value) VALUES (${reader.id}, ${couponId}, ${value})
      ON CONFLICT (reader_id, coupon_id) DO UPDATE SET value = EXCLUDED.value, at = now()`;
  }
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
  const [recent] = await sql()<{ n: number }[]>`
    SELECT count(*)::int AS n FROM comments
    WHERE reader_id = ${reader.id} AND created_at > now() - ${COMMENT_COOLDOWN_SECONDS} * interval '1 second'`;
  if (recent.n > 0) return { error: "Espera unos segundos antes de volver a comentar" };
  await sql()`INSERT INTO comments (coupon_id, reader_id, body) VALUES (${found.coupon.id}, ${reader.id}, ${body})`;
  refresh();
  return { posted: true };
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
  const [recent] = await sql()<{ n: number }[]>`
    SELECT count(*)::int AS n FROM coupons WHERE shared_by = ${reader.id} AND created_at > now() - interval '24 hours'`;
  if (recent.n >= SHARE_LIMIT_PER_DAY) return { error: "Has compartido 5 chollos hoy. Vuelve mañana" };
  await sql()`
    INSERT INTO coupons (store_id, kind, title, code, discount, description, target_url, expires_at, source, verified, archived, review, shared_by)
    VALUES (${storeId}, ${d.code ? "code" : "deal"}, ${d.title}, ${d.code}, ${d.discount}, ${d.description}, ${d.url}, ${d.expires_at},
            'manual', 0, 1, 'pending', ${reader.id})`;
  return { done: true };
}
