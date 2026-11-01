"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { requireAdmin, type Role } from "@/lib/auth";
import { mapCouponRows, type ImportStore } from "@/lib/coupon-import";
import { parseCsv } from "@/lib/csv";
import { errorMessage, required, str, type FormState } from "@/lib/form";
import { hashPassword, MIN_PASSWORD_LENGTH, newToken } from "@/lib/password";
import { WIPE_DATA_SQL } from "@/lib/schema";
import { startSession } from "@/lib/start-session";
import { appUrl, inviteEmail, sendEmail } from "@/lib/email";

// Every action here is admin-only except acceptInvite, which is the invitee proving they hold the link.

const ROLES: Role[] = ["admin", "editor", "viewer"];
const INVITE_DAYS = 7;
const MAX_IMPORT_BYTES = 2_000_000;

export type InviteState = FormState & { invitePath?: string; email?: string; emailed?: boolean };

// The copyable link stays the source of truth; the email is a convenience, so a send failure never fails the invite
async function emailInvite(to: string, name: string, inviter: string, token: string): Promise<boolean> {
  try {
    await sendEmail(to, inviteEmail(name, inviter, `${appUrl()}/invite/${token}`, INVITE_DAYS));
    return true;
  } catch (e) {
    console.error("[invite] email failed", e);
    return false;
  }
}

function parseRole(f: FormData): Role {
  const r = str(f, "role") as Role;
  if (!ROLES.includes(r)) throw new Error("Rol no válido");
  return r;
}

// Admins see every client; others need at least one
function parseClients(f: FormData, role: Role): number[] {
  const ids = f.getAll("clients").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (role !== "admin" && !ids.length) throw new Error("Elige al menos un cliente");
  return role === "admin" ? [] : ids;
}

export async function inviteUser(_prev: InviteState, f: FormData): Promise<InviteState> {
  try {
    const admin = await requireAdmin();
    const name = required(f, "name", "el nombre");
    const email = required(f, "email", "el email").toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) throw new Error("El email no es válido");
    const role = parseRole(f);
    const token = newToken();
    await sql()`
      INSERT INTO users (name, email, role, client_ids, status, invite_token, invite_expires_at)
      VALUES (${name}, ${email}, ${role}, ${parseClients(f, role)}, 'pending', ${token}, now() + ${INVITE_DAYS} * interval '1 day')`;
    await logActivity(`Invitación creada para ${email}`);
    revalidatePath("/settings");
    return { invitePath: `/invite/${token}`, email, emailed: await emailInvite(email, name, admin.name, token) };
  } catch (e) {
    const msg = errorMessage(e);
    return { error: msg === "Ya existe uno con ese nombre" ? "Ya hay un usuario con ese email" : msg };
  }
}

// New link for a pending invitation (the old one stops working)
export async function regenerateInvite(_prev: InviteState, f: FormData): Promise<InviteState> {
  try {
    const admin = await requireAdmin();
    const token = newToken();
    const [u] = await sql()<{ email: string; name: string }[]>`
      UPDATE users SET invite_token = ${token}, invite_expires_at = now() + ${INVITE_DAYS} * interval '1 day'
      WHERE id = ${Number(required(f, "id"))} AND status = 'pending' RETURNING email, name`;
    if (!u) throw new Error("Esta invitación ya no está pendiente");
    return { invitePath: `/invite/${token}`, email: u.email, emailed: await emailInvite(u.email, u.name, admin.name, token) };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

// Deletes an account or a pending invitation. Nothing references users by id (activity keeps names as text),
// and a deleted user's session cookie stops working because getUser no longer finds them.
export async function deleteUser(_prev: FormState, f: FormData): Promise<FormState> {
  try {
    const me = await requireAdmin();
    const id = Number(required(f, "id"));
    if (id === me.id) throw new Error("No puedes eliminarte a ti mismo");
    const [u] = await sql()<{ email: string; status: string }[]>`
      DELETE FROM users WHERE id = ${id}
        AND (role <> 'admin' OR status <> 'active'
          OR EXISTS (SELECT 1 FROM users o WHERE o.role = 'admin' AND o.status = 'active' AND o.id <> ${id}))
      RETURNING email, status`;
    if (!u) throw new Error("No se pudo eliminar: ya no existe o es el último administrador activo");
    await logActivity(u.status === "pending" ? `Invitación cancelada para ${u.email}` : `Usuario eliminado: ${u.email}`);
    revalidatePath("/settings");
    return {};
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function updateUser(_prev: FormState, f: FormData): Promise<FormState & { saved?: boolean }> {
  try {
    const me = await requireAdmin();
    const id = Number(required(f, "id"));
    const role = parseRole(f);
    const disable = str(f, "status") === "disabled";
    if (id === me.id && (role !== "admin" || disable)) throw new Error("No puedes quitarte el rol de administrador ni desactivarte a ti mismo");
    // keep at least one active admin
    if (role !== "admin" || disable) {
      const [{ n }] = await sql()<{ n: number }[]>`SELECT count(*)::int AS n FROM users WHERE role = 'admin' AND status = 'active' AND id <> ${id}`;
      if (n === 0) throw new Error("Tiene que quedar al menos un administrador activo");
    }
    await sql()`
      UPDATE users SET role = ${role}, client_ids = ${parseClients(f, role)},
        status = CASE WHEN ${disable} THEN 'disabled' WHEN status = 'disabled' THEN 'active' ELSE status END,
        session_version = session_version + CASE WHEN ${disable} THEN 1 ELSE 0 END
      WHERE id = ${id}`;
    revalidatePath("/settings");
    return { saved: true };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

// Public: the invitee sets a password from the link, then is signed in
export async function acceptInvite(_prev: FormState, f: FormData): Promise<FormState> {
  let user: { id: number; session_version: number } | undefined;
  try {
    const password = str(f, "password");
    if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`La contraseña necesita al menos ${MIN_PASSWORD_LENGTH} caracteres`);
    if (password !== str(f, "confirm")) throw new Error("Las contraseñas no coinciden");
    [user] = await sql()<{ id: number; session_version: number }[]>`
      UPDATE users SET password_hash = ${await hashPassword(password)}, status = 'active',
        invite_token = NULL, invite_expires_at = NULL, session_version = session_version + 1
      WHERE invite_token = ${required(f, "token")} AND status = 'pending' AND invite_expires_at > now()
      RETURNING id, session_version`;
    if (!user) throw new Error("La invitación ha caducado o ya se usó. Pide un enlace nuevo.");
    await startSession(user.id, user.session_version);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  redirect("/");
}

export async function setRetention(f: FormData) {
  await requireAdmin();
  const v = str(f, "retention");
  if (!["90", "365", "all"].includes(v)) throw new Error("Valor no válido");
  await sql()`INSERT INTO settings (key, value) VALUES ('click_retention_days', ${v}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  revalidatePath("/settings");
}

export async function setPublishUnverified(f: FormData) {
  await requireAdmin();
  const on = f.get("publish_unverified") === "on" ? "1" : "0";
  await sql()`INSERT INTO settings (key, value) VALUES ('publish_unverified', ${on}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  await logActivity(on === "1" ? "Modo demo: los cupones sin verificar se publican" : "Modo demo desactivado: solo se publican cupones verificados");
  revalidatePath("/", "layout");
}

export async function saveAiLimits(f: FormData) {
  await requireAdmin();
  const budget = Number(str(f, "budget").replace(",", "."));
  const alert = str(f, "alert");
  if (!(budget > 0 && budget <= 100_000)) throw new Error("El presupuesto debe ser un número mayor que 0");
  if (!["50", "80", "100"].includes(alert)) throw new Error("Aviso no válido");
  const pause = f.get("pause_search") === "on" ? "1" : "0";
  for (const [key, value] of [["ai_budget", String(budget)], ["ai_alert", alert], ["ai_pause_search", pause]]) {
    await sql()`INSERT INTO settings (key, value) VALUES (${key}, ${value}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  }
  revalidatePath("/costs");
}

export async function importCoupons(_prev: FormState & { imported?: number; problems?: string[] }, f: FormData) {
  try {
    await requireAdmin();
    const file = f.get("file");
    if (!(file instanceof File) || file.size === 0) throw new Error("Elige un archivo CSV");
    if (file.size > MAX_IMPORT_BYTES) throw new Error("El archivo es demasiado grande (máx. 2 MB)");
    const stores = await sql()<ImportStore[]>`SELECT id, name, slug, website FROM stores`;
    const { inserts, errors } = mapCouponRows(parseCsv(await file.text()), [...stores]);
    let imported = 0;
    for (const c of inserts) {
      // same store + title + code already there → skip as duplicate
      const r = await sql()`
        INSERT INTO coupons (store_id, kind, title, code, discount, description, target_url, expires_at, verified)
        SELECT ${c.store_id}, ${c.kind}, ${c.title}, ${c.code}, ${c.discount}, ${c.description}, ${c.target_url}, ${c.expires_at}, ${c.verified}
        WHERE NOT EXISTS (SELECT 1 FROM coupons WHERE store_id = ${c.store_id} AND title = ${c.title} AND code = ${c.code})`;
      imported += r.count;
    }
    const dupes = inserts.length - imported;
    if (imported) await logActivity(`${imported} cupón(es) importados desde CSV`);
    revalidatePath("/", "layout");
    return { imported, problems: [...errors, ...(dupes ? [`${dupes} fila(s) ya existían y se han ignorado`] : [])] };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function wipeAllData(f: FormData) {
  await requireAdmin();
  if (str(f, "confirm") !== "BORRAR") throw new Error("Escribe BORRAR para confirmar");
  await sql().unsafe(WIPE_DATA_SQL);
  revalidatePath("/", "layout");
  redirect("/settings?tab=data&wiped=1");
}
