import { cronAuthorized, tg, telegramConfig } from "@/lib/telegram";
import { markExpired, queueSummary, sendQueue } from "@/lib/telegram-flow";

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
    return Response.json({ ...queue, expired });
  } catch (e) {
    console.error("telegram cron failed", e);
    return Response.json({ error: "Falló el envío a Telegram" }, { status: 500 });
  }
}
