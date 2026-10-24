import { cookies } from "next/headers";
import { sql } from "./db";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession } from "./session";

// Sets the signed session cookie for a user who just proved who they are (login or accepted invitation)
export async function startSession(userId: number, sessionVersion: number) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Falta SESSION_SECRET en el servidor");
  (await cookies()).set(SESSION_COOKIE, await signSession(secret, userId, sessionVersion), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  await sql()`UPDATE users SET last_login_at = now() WHERE id = ${userId}`;
}
