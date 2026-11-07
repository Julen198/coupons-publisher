// "Avísame antes de cada fecha" (/calendario): which calendar dates are due, the one-click unsubscribe token and the
// email body. Pure, so it tests without a database (src/lib/date-alert-subs.ts and the cron route keep the queries).
import { createHmac } from "node:crypto";
import { byVotes } from "./community.ts";
import { escapeHtml, type Mail } from "./email.ts";
import { safeEqual } from "./session.ts";
import { dealPath, eventsOf, longDate, type ShopEvent } from "./site-text.ts";

export const DATE_ALERT_LEAD_DAYS = 2;
export const DATE_ALERT_DEALS = 5;

const DAY_MS = 86_400_000;
const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

// The calendar dates exactly DATE_ALERT_LEAD_DAYS after today (Madrid date, "YYYY-MM-DD")
export function eventsDueOn(todayIso: string): ShopEvent[] {
  const target = new Date(Date.parse(`${todayIso}T00:00:00Z`) + DATE_ALERT_LEAD_DAYS * DAY_MS).toISOString().slice(0, 10);
  return eventsOf(Number(target.slice(0, 4))).filter((e) => e.date === target);
}

// One send per reader and date (date_alert_sends primary key)
export const eventKey = (e: ShopEvent): string => `${e.date}|${e.name}`;

// "<readerId>.<hmac>": the purpose is part of the signed text, so it can't pass as a session or reader cookie
const unsubMac = (secret: string, readerId: number) =>
  createHmac("sha256", secret).update(`date-alerts.unsubscribe.${readerId}`).digest("hex");

export const signUnsubscribe = (secret: string, readerId: number): string => `${readerId}.${unsubMac(secret, readerId)}`;

export function verifyUnsubscribe(secret: string | undefined, token: string | null | undefined): number | null {
  if (!secret || !token) return null;
  const m = /^([1-9]\d{0,9})\.([0-9a-f]{64})$/.exec(token);
  if (!m) return null;
  const id = Number(m[1]);
  return safeEqual(m[2], unsubMac(secret, id)) ? id : null;
}

export const unsubscribeUrl = (base: string, secret: string, readerId: number): string =>
  `${base}/api/date-alerts/baja?t=${signUnsubscribe(secret, readerId)}`;

type Rankable = Parameters<typeof byVotes>[0];

// The deals the email lists: the best by community votes (same order as "Más votados"); returns a new list
export const alertDeals = <T extends Rankable>(list: readonly T[]): T[] => [...list].sort(byVotes).slice(0, DATE_ALERT_DEALS);

export type AlertDeal = { id: number; title: string; display_title: string; store_name: string; discount: string };

const whenOf = (iso: string) => `${WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()]} ${longDate(iso)}`;

export function dateAlertEmail(input: { event: ShopEvent; deals: readonly AlertDeal[]; base: string; unsubscribe: string }): Mail {
  const { event, base, unsubscribe } = input;
  const deals = input.deals.slice(0, DATE_ALERT_DEALS).map((d) => ({ ...d, url: `${base}${dealPath(d)}` }));
  const intro = `${event.name} es el ${whenOf(event.date)}. ${event.note}.`;
  const lead = deals.length ? "Estos son los mejores chollos activos ahora mismo:" : "Mira los chollos activos en CuponLab:";
  const footer = "Te llega porque creaste un aviso en el calendario de CuponLab.";
  const dealLine = (d: (typeof deals)[number]) => `${d.discount ? `${d.discount} · ` : ""}${d.display_title} (${d.store_name})`;
  const text = [
    "Hola.", "", intro, "", lead,
    ...(deals.length ? deals.map((d) => `- ${dealLine(d)}\n  ${d.url}`) : [`${base}/`]),
    "", footer, `Darte de baja: ${unsubscribe}`,
  ].join("\n");
  const items = deals.length
    ? `<ul style="padding:0 0 0 18px;margin:0 0 20px">${deals
        .map((d) => `<li style="margin:0 0 8px"><a href="${escapeHtml(d.url)}" style="color:#1d4ed8">${escapeHtml(dealLine(d))}</a></li>`)
        .join("")}</ul>`
    : `<p style="margin:0 0 20px"><a href="${escapeHtml(`${base}/`)}" style="color:#1d4ed8">${escapeHtml(`${base}/`)}</a></p>`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px;color:#171717">
<h1 style="font-size:22px;margin:0 0 12px">Hola</h1>
<p style="font-size:15px;line-height:1.5;margin:0 0 12px">${escapeHtml(intro)}</p>
<p style="font-size:15px;line-height:1.5;margin:0 0 8px">${escapeHtml(lead)}</p>
${items}
<p style="font-size:13px;color:#525252;margin:24px 0 0">${escapeHtml(footer)} <a href="${escapeHtml(unsubscribe)}" style="color:#525252">Darte de baja</a></p>
</div>`;
  return {
    subject: `${event.name} es en ${DATE_ALERT_LEAD_DAYS} días: los mejores chollos`,
    text,
    html,
    headers: { "List-Unsubscribe": `<${unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}
