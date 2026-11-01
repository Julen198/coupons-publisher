import { createHash } from "node:crypto";

export const MAGIC_LINK_MINUTES = 15;
// one email per user per minute, so the form can't be used to flood an inbox
export const MAGIC_LINK_COOLDOWN_SECONDS = 60;

// Only the hash is stored: a DB leak doesn't hand out working sign-in links
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

// Never built from the request Host header: a forged Host would put an attacker's domain in the emailed link
export function appUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function magicLinkEmail(name: string, link: string) {
  const first = escapeHtml(name.split(" ")[0] ?? "");
  return {
    subject: "Tu enlace para entrar en CuponLab",
    text: `Hola, ${first}.\n\nEntra en CuponLab con este enlace (caduca en ${MAGIC_LINK_MINUTES} minutos y solo sirve una vez):\n${link}\n\nSi no lo has pedido tú, ignora este email.`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px;color:#171717">
<h1 style="font-size:22px;margin:0 0 12px">Hola, ${first}</h1>
<p style="font-size:15px;line-height:1.5;margin:0 0 20px">Pulsa el botón para entrar en tu panel de CuponLab. El enlace caduca en ${MAGIC_LINK_MINUTES} minutos y solo sirve una vez.</p>
<a href="${escapeHtml(link)}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px">Entrar en CuponLab</a>
<p style="font-size:13px;color:#525252;margin:24px 0 0">Si no lo has pedido tú, ignora este email.</p>
</div>`,
  };
}

// Resend REST API directly: one fetch doesn't justify the SDK
export async function sendEmail(to: string, mail: { subject: string; text: string; html: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("Falta RESEND_API_KEY en el servidor");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    // ponytail: onboarding@resend.dev only delivers to the Resend account owner; set RESEND_FROM once a domain is verified
    body: JSON.stringify({ from: process.env.RESEND_FROM ?? "CuponLab <onboarding@resend.dev>", to, ...mail }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}
