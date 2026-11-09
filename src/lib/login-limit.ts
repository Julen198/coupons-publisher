// Login brute-force guard, the pure part (the queries are in actions.ts): failed attempts are counted per account and
// per IP in a short window. Keys are hashed so the login_attempts table never holds an email or an IP.
import { createHash } from "node:crypto";

export const LOGIN_LIMITS = { windowMinutes: 15, perAccount: 5, perIp: 20 } as const;

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);

export function attemptKeys(email: string, ip: string): { account: string; ip: string } {
  return { account: `a:${hash(email.trim().toLowerCase())}`, ip: `i:${hash(ip)}` };
}

// Failures counted in the window → what is locked, or null
export function blockedFor(fails: { account: number; ip: number }): "account" | "ip" | null {
  if (fails.account >= LOGIN_LIMITS.perAccount) return "account";
  if (fails.ip >= LOGIN_LIMITS.perIp) return "ip";
  return null;
}

// On Vercel the first x-forwarded-for address is the client (the platform sets it; a client can't forge past it)
export function clientIp(forwardedFor: string | null, realIp: string | null): string {
  return forwardedFor?.split(",")[0]?.trim() || realIp?.trim() || "unknown";
}
