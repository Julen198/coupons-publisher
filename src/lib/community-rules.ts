// What the reader and moderation actions decide, apart from their SQL: which form values they accept, which
// changes they make and what they answer. Pure, so it tests without a database (the actions keep the queries).
import { couponIdOf, flagOf, EXPIRY_REPORT_LIMIT_PER_DAY } from "./community.ts";

// --- readers (src/app/(site)/actions-reader.ts)

export function voteRequest(rawCoupon: string, rawValue: string): { couponId: number; pressed: -1 | 1 } | null {
  const couponId = couponIdOf(rawCoupon);
  const pressed = rawValue === "1" ? 1 : rawValue === "-1" ? -1 : null;
  return couponId && pressed ? { couponId, pressed } : null;
}

// "Guardar" / "Guardado": the form says the state it wants (1 save, 0 remove)
export function savedRequest(rawCoupon: string, rawNext: string): { couponId: number; save: 0 | 1 } | null {
  const couponId = couponIdOf(rawCoupon);
  const save = flagOf(rawNext);
  return couponId && save !== null ? { couponId, save } : null;
}

export const PARENT_GONE_MESSAGE = "Ese comentario ya no existe";
export const COMMENT_COOLDOWN_MESSAGE = "Espera unos segundos antes de volver a comentar";

// Checked in this order: the deal still takes comments, then the text is a valid length
export function commentInputError(live: boolean, body: string | null): string | null {
  if (!live) return "Este chollo ya no admite comentarios";
  if (!body) return "Escribe entre 2 y 1000 caracteres";
  return null;
}

export const SHARE_LIMIT_PER_DAY = 5;
export const shareLimitMessage = `Has compartido ${SHARE_LIMIT_PER_DAY} chollos hoy. Vuelve mañana`;

export const storeIdFor = (stores: readonly { id: number; slug: string }[], slug: string): number | null =>
  stores.find((s) => s.slug === slug)?.id ?? null;

export const REPORT_INACTIVE_MESSAGE = "Este chollo ya no está activo";
export const expiryLimitMessage = `Ya has avisado de ${EXPIRY_REPORT_LIMIT_PER_DAY} chollos hoy. Vuelve mañana`;

// --- moderation (src/app/actions-community.ts)

export function moderationId(raw: string): number {
  const id = couponIdOf(raw);
  if (!id) throw new Error("Identificador no válido");
  return id;
}

export function moderationFlag(raw: string): 0 | 1 {
  const v = flagOf(raw);
  if (v === null) throw new Error("Valor no válido");
  return v;
}

// What publishing or rejecting a shared deal sets. Only a pending shared deal changes (the action's WHERE).
export function sharedReviewPatch(action: "publish" | "reject"): { archived?: 0; review: "" | "rejected"; verified?: 1 } {
  return action === "publish" ? { archived: 0, review: "", verified: 1 } : { review: "rejected" };
}

// The reasons an editor can give when rejecting a shared deal; the reader sees it on /cuenta ("Rechazado: …")
export const REJECT_REASONS = ["ya estaba publicado", "ha caducado", "no es un chollo", "el enlace no funciona", "falta información"] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

export function rejectReasonOf(raw: string): RejectReason {
  const found = REJECT_REASONS.find((r) => r === raw);
  if (!found) throw new Error("Elige un motivo de la lista");
  return found;
}

// Blocking also bumps session_version, so the reader's cookie stops working right away
export function readerBlockChange(blocked: 0 | 1): { status: "active" | "blocked"; sessionBump: 0 | 1 } {
  return blocked ? { status: "blocked", sessionBump: 1 } : { status: "active", sessionBump: 0 };
}

export const publishedActivity = (handle: string | null, title: string): string =>
  `Publicado el chollo compartido por @${handle ?? "lector"}: ${title}`;
