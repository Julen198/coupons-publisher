import { tg, telegramConfig } from "@/lib/telegram";
import { markExpired, queueSummary, sendQueue } from "@/lib/telegram-flow";

// Daily Vercel cron (vercel.json): mark expired channel posts, then send the new deals to the admin chat
export async function GET(req: Request) {
  const cfg = telegramConfig();
  if (!cfg) return new Response("Telegram no está configurado", { status: 503 });
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
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
