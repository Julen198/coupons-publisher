import { telegramConfig } from "@/lib/telegram";
import { handleUpdate, validSecret, type TelegramUpdate } from "@/lib/telegram-flow";

// Telegram webhook: buttons and messages from the admin chat
export async function POST(req: Request) {
  const cfg = telegramConfig();
  if (!cfg) return new Response("Telegram no está configurado", { status: 503 });
  if (!validSecret(cfg, req.headers.get("x-telegram-bot-api-secret-token"))) return new Response("Forbidden", { status: 403 });
  try {
    await handleUpdate(cfg, (await req.json().catch(() => null)) as TelegramUpdate | null);
  } catch (e) {
    console.error("telegram webhook failed", e);
  }
  // always 200: otherwise Telegram keeps retrying the same update
  return new Response("ok");
}
