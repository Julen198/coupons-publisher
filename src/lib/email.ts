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

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export interface Mail {
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>; // extra mail headers, e.g. List-Unsubscribe
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

// One template for every transactional email: greeting, one paragraph, one button, footer note
function layout(name: string, body: string, cta: string, link: string, footer: string): string {
  return `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px;color:#171717">
<h1 style="font-size:22px;margin:0 0 12px">${escapeHtml(firstName(name) ? `Hola, ${firstName(name)}` : "Hola")}</h1>
<p style="font-size:15px;line-height:1.5;margin:0 0 20px">${escapeHtml(body)}</p>
<a href="${escapeHtml(link)}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px">${escapeHtml(cta)}</a>
<p style="font-size:13px;color:#525252;margin:24px 0 0">${escapeHtml(footer)}</p>
</div>`;
}

export function magicLinkEmail(name: string, link: string): Mail {
  const body = `Pulsa el botón para entrar en tu panel de CuponLab. El enlace caduca en ${MAGIC_LINK_MINUTES} minutos y solo sirve una vez.`;
  const footer = "Si no lo has pedido tú, ignora este email.";
  return {
    subject: "Tu enlace para entrar en CuponLab",
    text: `Hola, ${firstName(name)}.\n\n${body}\n${link}\n\n${footer}`,
    html: layout(name, body, "Entrar en CuponLab", link, footer),
  };
}

// The reader sign-in email (SiteEntrarVuelta board, step 1). Tables and inline styles only: mail clients drop <style>
// and most layout CSS. The logo is drawn with table cells, not an image or SVG, so it shows with images blocked.
export function readerLinkEmail(link: string): Mail {
  const body = `Pulsa el botón para entrar. El enlace sirve una vez y caduca en ${MAGIC_LINK_MINUTES} minutos.`;
  const footer = "Si no lo has pedido tú, ignora este email. Nadie puede entrar sin él.";
  const cta = "Entrar en CuponLab";
  const href = escapeHtml(link);
  const font = "font-family:Archivo,'Helvetica Neue',Arial,sans-serif";
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(cta)}</title></head>
<body style="margin:0;padding:0;background:#f3f5fa">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f5fa">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:420px;background:#ffffff;border:1px solid #d9dfeb;border-radius:10px;${font};color:#141a2b">
<tr><td style="padding:24px 22px 0">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="26" height="26" align="center" valign="middle" style="width:26px;height:26px;background:#1d4ed8;border-radius:7px;color:#ffffff;font-size:15px;font-weight:800;line-height:26px">%</td>
<td style="padding-left:8px;font-size:17px;font-weight:800;color:#141a2b">Cupon<span style="color:#1d4ed8">Lab</span></td>
</tr></table>
</td></tr>
<tr><td style="padding:16px 22px 0;font-size:15px;line-height:1.55">${escapeHtml(body)}</td></tr>
<tr><td style="padding:18px 22px 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="center" style="background:#1d4ed8;border-radius:10px"><a href="${href}" style="display:block;padding:13px 16px;color:#ffffff;font-weight:700;font-size:15px;text-decoration:none">${escapeHtml(cta)}</a></td>
</tr></table>
</td></tr>
<tr><td style="padding:16px 22px 24px;font-size:12px;line-height:1.5;color:#5f6880">${escapeHtml(footer)}</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
  return {
    subject: "Tu enlace para entrar en CuponLab",
    text: `${body}\n\n${cta}:\n${link}\n\n${footer}`,
    html,
  };
}

export function inviteEmail(name: string, inviter: string, link: string, days: number): Mail {
  const body = `${inviter} te ha invitado al panel de CuponLab. Pulsa el botón para crear tu contraseña y empezar. La invitación caduca en ${days} días.`;
  const footer = "Si no esperabas esta invitación, ignora este email.";
  return {
    subject: `${inviter} te ha invitado a CuponLab`,
    text: `Hola, ${firstName(name)}.\n\n${body}\n${link}\n\n${footer}`,
    html: layout(name, body, "Aceptar invitación", link, footer),
  };
}

// The Resend settings a real send needs and that are unset or blank (names only, safe to log). Without RESEND_FROM
// mail goes out from onboarding@resend.dev, which only reaches the Resend account owner.
export function missingEmailConfig(env: Record<string, string | undefined>): string[] {
  return ["RESEND_API_KEY", "RESEND_FROM"].filter((k) => !env[k]?.trim());
}

// Resend REST API directly: one fetch doesn't justify the SDK
export async function sendEmail(to: string, mail: Mail): Promise<void> {
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
