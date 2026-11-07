// Telegram Bot API: plain fetch, no library. Pure message helpers are exported for tests.
import { discountBadge } from "./discount.ts";
import { longDate, slugify } from "./site-text.ts";

export type DealFields = {
  id: number;
  kind: "code" | "deal";
  title: string;
  code: string;
  discount: string;
  expires_at: string;
  store_name: string;
};

type Button = { text: string; callback_data?: string; url?: string };
export type Keyboard = { inline_keyboard: Button[][] };

const ACTIONS = ["pub", "edit", "del"] as const;
export type ReviewAction = (typeof ACTIONS)[number];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// url: the deal page (with utm); channel: "@name" for the follow line; site: our host for the footer
export type MessageLinks = { url: string; channel?: string | null; site: string };

// "El Corte Inglés" → "#elcorteingles"
export const hashtag = (store: string) => `#${slugify(store).replace(/-/g, "")}`;

// HTML caption for the admin chat and the public channel, laid out like Spanish deal channels:
// headline, store hashtag, title, code and expiry, link, follow footer
export function dealMessage(c: DealFields, links: MessageLinks, title = c.title): string {
  const badge = discountBadge(c.discount) || (c.kind === "code" ? "Código" : "Oferta");
  const blocks = [
    [`💥 <b>${esc(c.store_name.toUpperCase())}: ${esc(badge.toUpperCase())}</b> ❗`, hashtag(c.store_name)],
    [esc(title)],
    [c.kind === "code" && c.code ? `🏷 Código: <code>${esc(c.code)}</code>` : "", c.expires_at ? `⏳ Válido hasta el ${longDate(c.expires_at)}` : ""],
    [`➡️ <a href="${esc(links.url)}">${esc(links.site)}/chollos/${c.id}</a>`],
    [links.channel ? `📣 Síguenos: ${esc(links.channel)}` : "", `🌍 ${esc(links.site)}`],
  ];
  return blocks
    .map((lines) => lines.filter(Boolean).join("\n"))
    .filter(Boolean)
    .join("\n\n");
}

export const reviewKeyboard = (id: number): Keyboard => ({
  inline_keyboard: [
    [
      { text: "✅ Publicar", callback_data: `pub:${id}` },
      { text: "✏️ Editar", callback_data: `edit:${id}` },
      { text: "🗑 Descartar", callback_data: `del:${id}` },
    ],
  ],
});

export function parseCallback(data: string | undefined): { action: ReviewAction; id: number } | null {
  const m = /^(\w+):(\d+)$/.exec(data ?? "");
  if (!m || !ACTIONS.includes(m[1] as ReviewAction)) return null;
  return { action: m[1] as ReviewAction, id: Number(m[2]) };
}

export const editPrompt = (id: number) => `✏️ Responde con el título para el canal (#${id})`;

export function promptCouponId(text: string | undefined): number | null {
  const m = /\(#(\d+)\)$/.exec(text ?? "");
  return m ? Number(m[1]) : null;
}

// ponytail: the bot's username never changes, so no env var for it
export const REVIEW_BOT_URL = "https://t.me/cuponlab_panel_bot";

// Join link for the public channel; null while TELEGRAM_CHANNEL_ID isn't a public @username
export function channelUrl(channelId = process.env.TELEGRAM_CHANNEL_ID): string | null {
  const m = /^@(\w{4,})$/.exec(channelId ?? "");
  return m ? `https://t.me/${m[1]}` : null;
}

export type TelegramConfig ={ token: string; channelId: string; adminChatId: string; webhookSecret: string };

// null = Telegram not set up (routes answer 503 instead of crashing)
export function telegramConfig(): TelegramConfig | null {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID, TELEGRAM_ADMIN_CHAT_ID, TELEGRAM_WEBHOOK_SECRET } = process.env;
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHANNEL_ID || !TELEGRAM_ADMIN_CHAT_ID || !TELEGRAM_WEBHOOK_SECRET) return null;
  return { token: TELEGRAM_BOT_TOKEN, channelId: TELEGRAM_CHANNEL_ID, adminChatId: TELEGRAM_ADMIN_CHAT_ID, webhookSecret: TELEGRAM_WEBHOOK_SECRET };
}

// The daily cron's Authorization header (Vercel sends Bearer CRON_SECRET). Fails closed when no secret is set.
export function cronAuthorized(secret: string | undefined, authorization: string | null): boolean {
  return !!secret && authorization === `Bearer ${secret}`;
}

export async function tg<T = unknown>(cfg: TelegramConfig, method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${cfg.token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!json.ok) throw new Error(`Telegram ${method}: ${json.description ?? res.status}`);
  return json.result as T;
}
