"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { cleanHandle } from "@/lib/community";
import { appUrl, hashToken, MAGIC_LINK_COOLDOWN_SECONDS, MAGIC_LINK_MINUTES, readerLinkEmail, sendEmail } from "@/lib/email";
import { str, type FormState } from "@/lib/form";
import { newToken } from "@/lib/password";
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
