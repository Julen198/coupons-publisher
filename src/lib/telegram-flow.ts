// Deals reach the admin's private chat for review; approved ones are posted to the public channel.
// coupons.telegram_status: '' = not sent yet, review = in the admin chat, published / discarded / expired.
import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { askPanel } from "./panel-assistant";
import { sql } from "./db";
import { siteCoupon, siteCoupons } from "./public-site";
import { dealPath, siteUrl } from "./site-text";
import { dealMessage, editPrompt, parseCallback, promptCouponId, reviewKeyboard, tg, type DealFields, type TelegramConfig } from "./telegram";

const BATCH = 10;
// ponytail: only coupons from the last 3 days reach the admin chat, so switching the bot on doesn't flood it with the whole catalogue
const FRESH_DAYS = 3;

export type TelegramUpdate = {
  callback_query?: { id: string; from: { id: number }; data?: string; message?: { chat: { id: number }; message_id: number } };
  message?: { chat: { id: number }; text?: string; reply_to_message?: { text?: string } };
};

export function validSecret(cfg: TelegramConfig, header: string | null): boolean {
  const a = Buffer.from(header ?? "");
  const b = Buffer.from(cfg.webhookSecret);
  return a.length === b.length && timingSafeEqual(a, b);
}

const say = (cfg: TelegramConfig, text: string, extra: Record<string, unknown> = {}) =>
  tg(cfg, "sendMessage", { chat_id: cfg.adminChatId, text, parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...extra });

type PostableDeal = DealFields & { store_name: string };

// Caption plus the deal page's big preview image (its og:image) under the text, like Spanish deal channels
function dealPost(cfg: TelegramConfig, c: PostableDeal, title?: string) {
  const url = `${siteUrl()}${dealPath(c)}?utm_source=telegram`;
  const links = { url, channel: cfg.channelId.startsWith("@") ? cfg.channelId : null, site: new URL(siteUrl()).host };
  return {
    url,
    body: { text: dealMessage(c, links, title), parse_mode: "HTML", link_preview_options: { url, prefer_large_media: true, show_above_text: false } },
  };
}

// Claims up to BATCH new live coupons and sends each to the admin chat with Publicar / Editar / Descartar (or, with no
// public channel yet, just a link to the deal)
export async function sendQueue(cfg: TelegramConfig): Promise<{ sent: number; left: number }> {
  const since = Date.now() - FRESH_DAYS * 86_400_000;
  const fresh = (await siteCoupons()).filter((c) => new Date(c.created_at).getTime() >= since);
  if (!fresh.length) return { sent: 0, left: 0 };
  const byId = new Map(fresh.map((c) => [c.id, c]));
  const ids = [...byId.keys()];
  // claim first so the daily cron and /pendientes never send the same coupon twice
  const claimed = await sql()<{ id: number }[]>`
    UPDATE coupons SET telegram_status = 'review'
    WHERE id IN (SELECT id FROM coupons WHERE id = ANY(${ids}::int[]) AND telegram_status = '' ORDER BY id DESC LIMIT ${BATCH})
    RETURNING id`;
  let sent = 0;
  for (const { id } of claimed) {
    try {
      const post = dealPost(cfg, byId.get(id)!);
      // without the public channel there is nothing to publish to: the deal arrives as a notice with its link
      const keyboard = cfg.channelId ? reviewKeyboard(id) : { inline_keyboard: [[{ text: "👉 Ver chollo", url: post.url }]] };
      await tg(cfg, "sendMessage", { chat_id: cfg.adminChatId, ...post.body, reply_markup: keyboard });
      sent++;
    } catch (e) {
      console.error("telegram: review message failed", id, e);
      await sql()`UPDATE coupons SET telegram_status = '' WHERE id = ${id}`;
    }
  }
  const [{ n }] = await sql()<{ n: number }[]>`SELECT count(*)::int AS n FROM coupons WHERE id = ANY(${ids}::int[]) AND telegram_status = ''`;
  return { sent, left: n };
}

export const queueSummary = ({ sent, left }: { sent: number; left: number }) =>
  sent ? `📬 ${sent} chollo(s) nuevo(s)${left ? `. Quedan ${left}: /pendientes` : ""}` : "No hay chollos nuevos por revisar";

type Outcome = { ok: boolean; note: string };

export async function publish(cfg: TelegramConfig, id: number, title?: string): Promise<Outcome> {
  if (!cfg.channelId) return { ok: false, note: "Falta el canal público (TELEGRAM_CHANNEL_ID)" };
  const found = await siteCoupon(id);
  if (!found?.live) return { ok: false, note: "Ya no está activo en la web" };
  const [claimed] = await sql()`UPDATE coupons SET telegram_status = 'published' WHERE id = ${id} AND telegram_status IN ('', 'review') RETURNING id`;
  if (!claimed) return { ok: false, note: "Ya estaba publicado o descartado" };
  const { url, body } = dealPost(cfg, found.coupon, title);
  try {
    const msg = await tg<{ message_id: number }>(cfg, "sendMessage", {
      chat_id: cfg.channelId,
      ...body,
      reply_markup: { inline_keyboard: [[{ text: "👉 Ir al chollo", url }]] },
    });
    await sql()`UPDATE coupons SET telegram_message_id = ${msg.message_id} WHERE id = ${id}`;
    return { ok: true, note: "✅ Publicado en el canal" };
  } catch (e) {
    await sql()`UPDATE coupons SET telegram_status = 'review' WHERE id = ${id}`;
    throw e;
  }
}

async function discard(id: number): Promise<Outcome> {
  const [row] = await sql()`UPDATE coupons SET telegram_status = 'discarded' WHERE id = ${id} AND telegram_status IN ('', 'review') RETURNING id`;
  return row ? { ok: true, note: "🗑 Descartado" } : { ok: false, note: "Ya estaba publicado o descartado" };
}

// Channel posts of coupons no longer live get their button swapped for "❌ Caducado"
export async function markExpired(cfg: TelegramConfig): Promise<number> {
  if (!cfg.channelId) return 0;
  const posted = await sql()<{ id: number; telegram_message_id: number }[]>`
    SELECT id, telegram_message_id FROM coupons WHERE telegram_status = 'published' AND telegram_message_id IS NOT NULL`;
  if (!posted.length) return 0;
  const live = new Set((await siteCoupons()).map((c) => c.id));
  let done = 0;
  for (const p of posted.filter((p) => !live.has(p.id))) {
    try {
      await tg(cfg, "editMessageReplyMarkup", {
        chat_id: cfg.channelId,
        message_id: p.telegram_message_id,
        reply_markup: { inline_keyboard: [[{ text: "❌ Caducado", url: `${siteUrl()}/chollos/${p.id}` }]] },
      });
      await sql()`UPDATE coupons SET telegram_status = 'expired' WHERE id = ${p.id}`;
      done++;
    } catch (e) {
      console.error("telegram: expiry edit failed", p.id, e);
    }
  }
  return done;
}

async function onButton(cfg: TelegramConfig, q: NonNullable<TelegramUpdate["callback_query"]>) {
  const parsed = parseCallback(q.data);
  if (!parsed) return tg(cfg, "answerCallbackQuery", { callback_query_id: q.id });
  if (parsed.action === "edit") {
    await say(cfg, editPrompt(parsed.id), { reply_markup: { force_reply: true, input_field_placeholder: "Título para el canal" } });
    return tg(cfg, "answerCallbackQuery", { callback_query_id: q.id });
  }
  const out = parsed.action === "pub" ? await publish(cfg, parsed.id) : await discard(parsed.id);
  await tg(cfg, "answerCallbackQuery", { callback_query_id: q.id, text: out.note });
  // the review message keeps its text; its buttons become the outcome
  if (out.ok && q.message) {
    await tg(cfg, "editMessageReplyMarkup", {
      chat_id: q.message.chat.id,
      message_id: q.message.message_id,
      reply_markup: { inline_keyboard: [[{ text: out.note, callback_data: "done" }]] },
    });
  }
}

async function onMessage(cfg: TelegramConfig, m: NonNullable<TelegramUpdate["message"]>) {
  const text = m.text?.trim() ?? "";
  const editing = promptCouponId(m.reply_to_message?.text);
  if (editing && text) return say(cfg, (await publish(cfg, editing, text)).note);
  if (text.startsWith("/pendientes")) return say(cfg, queueSummary(await sendQueue(cfg)));
  if (!text || text.startsWith("/")) return say(cfg, HELP);
  // the AI answer can take a while: answer Telegram's webhook now (or it retries the update) and reply when done
  await tg(cfg, "sendChatAction", { chat_id: cfg.adminChatId, action: "typing" });
  after(() => answer(cfg, text, m.reply_to_message?.text));
}

const HELP =
  "Pregúntame lo que quieras del panel: «¿cuántos clics tuvo Kiwoko esta semana?», «¿qué guía se publica mañana?», «¿cuánto llevamos gastado en IA?». " +
  "Solo consulto, no cambio nada.\n\nComandos: /pendientes para revisar chollos nuevos. Para editar un título, pulsa ✏️ y responde al mensaje.";

async function answer(cfg: TelegramConfig, question: string, replyingTo?: string) {
  let reply: string;
  try {
    reply = await askPanel(question, replyingTo);
  } catch (e) {
    console.error("panel assistant failed", e);
    reply = e instanceof Error && e.name === "AiBudgetError" ? e.message : "No he podido responder ahora. Prueba otra vez en un momento.";
  }
  // plain text: the model's answer isn't escaped for Telegram HTML
  await tg(cfg, "sendMessage", { chat_id: cfg.adminChatId, text: reply, link_preview_options: { is_disabled: true } });
}

export async function handleUpdate(cfg: TelegramConfig, u: TelegramUpdate | null): Promise<void> {
  const fromAdmin = (id?: number) => id !== undefined && String(id) === cfg.adminChatId;
  if (u?.callback_query && fromAdmin(u.callback_query.from.id)) await onButton(cfg, u.callback_query);
  else if (u?.message && fromAdmin(u.message.chat.id)) await onMessage(cfg, u.message);
  // anyone else is ignored
}
