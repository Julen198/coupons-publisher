import { alertDeals, dateAlertEmail, eventKey, eventsDueOn, unsubscribeUrl } from "@/lib/date-alerts";
import { claimSend, dueSubscribers, releaseSend } from "@/lib/date-alert-subs";
import { missingEmailConfig, sendEmail } from "@/lib/email";
import { siteCoupons } from "@/lib/public-site";
import { isMissingSchema } from "@/lib/schema-guard";
import { madridToday, siteUrl } from "@/lib/site-text";
import { cronAuthorized } from "@/lib/telegram";

// One email per subscriber can take a while; Vercel stops the function at this many seconds
export const maxDuration = 300;

// Daily Vercel cron (vercel.json): "Avísame antes de cada fecha" emails for the calendar dates two days ahead.
// Auth first: an unauthenticated caller gets 401 whether or not email is configured.
export async function GET(req: Request) {
  if (!cronAuthorized(process.env.CRON_SECRET, req.headers.get("authorization"))) return new Response("Unauthorized", { status: 401 });
  const missing = [...missingEmailConfig(process.env), ...(process.env.SESSION_SECRET ? [] : ["SESSION_SECRET"])];
  if (missing.length) {
    console.error("[date-alerts] email not configured", { missing });
    return new Response("El email no está configurado", { status: 503 });
  }
  const secret = process.env.SESSION_SECRET!;
  const due = eventsDueOn(madridToday(new Date()).iso);
  if (!due.length) return Response.json({ due: [], sent: 0, failed: 0 });
  try {
    const base = siteUrl();
    const deals = alertDeals(await siteCoupons());
    let sent = 0;
    let failed = 0;
    for (const event of due) {
      const key = eventKey(event);
      for (const r of await dueSubscribers(key)) {
        if (!(await claimSend(r.id, key))) continue;
        try {
          await sendEmail(r.email, dateAlertEmail({ event, deals, base, unsubscribe: unsubscribeUrl(base, secret, r.id) }));
          sent += 1;
        } catch (e) {
          console.error("[date-alerts] send failed", { reader: r.id, key }, e);
          await releaseSend(r.id, key);
          failed += 1;
        }
      }
    }
    return Response.json({ due: due.map(eventKey), sent, failed });
  } catch (e) {
    if (isMissingSchema(e)) {
      console.error("[date-alerts] date_alert tables missing, run SCHEMA_SQL", e);
      return new Response("Faltan las tablas de avisos", { status: 503 });
    }
    console.error("[date-alerts] cron failed", e);
    return Response.json({ error: "Falló el envío de avisos" }, { status: 500 });
  }
}
