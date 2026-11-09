import { cronAuthorized, tg, telegramConfig } from "@/lib/telegram";
import { markExpired, newStoresSummary, queueSummary, sendQueue } from "@/lib/telegram-flow";
import { loadStats } from "@/lib/stats";
import { siteUrl } from "@/lib/site-text";
import { weeklyReport } from "@/lib/weekly-report";

// Daily Vercel cron (vercel.json): mark expired channel posts, then send the new deals to the admin chat.
// Auth first: an unauthenticated caller gets 401 whether or not Telegram is configured.
export async function GET(req: Request) {
  if (!cronAuthorized(process.env.CRON_SECRET, req.headers.get("authorization"))) return new Response("Unauthorized", { status: 401 });
  const cfg = telegramConfig();
  if (!cfg) return new Response("Telegram no está configurado", { status: 503 });
  try {
    const expired = await markExpired(cfg);
    const queue = await sendQueue(cfg);
    if (queue.sent) await tg(cfg, "sendMessage", { chat_id: cfg.adminChatId, text: queueSummary(queue) });
    // Mondays (Madrid): new stores each client hasn't reviewed yet
    const monday = new Date().toLocaleDateString("en-GB", { weekday: "long", timeZone: "Europe/Madrid" }) === "Monday";
    const stores = monday ? await newStoresSummary() : "";
    if (stores) await tg(cfg, "sendMessage", { chat_id: cfg.adminChatId, text: stores, link_preview_options: { is_disabled: true } });
    // Mondays: last week's report (Google, visits, clicks, commissions, every guide, searches within reach)
    if (monday) {
      const s = await loadStats(7);
      const report = weeklyReport({
        range: s.range, cur: s.cur, prev: s.prev, site: siteUrl(),
        guides: s.stores.filter((r) => r.guide === "published").map((r) => ({ name: r.name, impressions: r.impressions, position: r.position, clicks: r.clicks, earned: r.earned })),
        nearQueries: s.queries.filter((q) => q.position >= 8 && q.position <= 30).slice(0, 5),
      });
      await tg(cfg, "sendMessage", { chat_id: cfg.adminChatId, text: report, link_preview_options: { is_disabled: true } });
    }
    return Response.json({ ...queue, expired });
  } catch (e) {
    console.error("telegram cron failed", e);
    return Response.json({ error: "Falló el envío a Telegram" }, { status: 500 });
  }
}
