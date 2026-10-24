// Signed session cookie "<userId>.<sessionVersion>.<hmac>", keyed by SESSION_SECRET.
// The proxy only checks the signature (no DB at the edge); pages and actions then load the user
// and compare session_version, so changing a password or disabling a user revokes old cookies.
// Web Crypto only: this runs in the proxy as well as in server code.

export const SESSION_COOKIE = "cp_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

async function hmac(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signSession(secret: string, userId: number, version: number): Promise<string> {
  const payload = `${userId}.${version}`;
  return `${payload}.${await hmac(secret, payload)}`;
}

export async function verifySession(secret: string | undefined, token: string | undefined): Promise<{ userId: number; version: number } | null> {
  if (!secret || !token) return null;
  const m = token.match(/^(\d+)\.(\d+)\.([0-9a-f]{64})$/);
  if (!m) return null;
  if (!safeEqual(m[3], await hmac(secret, `${m[1]}.${m[2]}`))) return null;
  return { userId: Number(m[1]), version: Number(m[2]) };
}

// Constant-time string compare (same length hex tokens)
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Only same-site relative paths, so ?next= can't bounce people to another domain
export const safeNext = (next: string | null | undefined) => (next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
