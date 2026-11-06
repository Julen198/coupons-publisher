"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { fillProductImages } from "@/lib/fill-product-images";
import { sql } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { requireEditor } from "@/lib/auth";
import { couponIdOf, flagOf } from "@/lib/community";
import { errorMessage, str } from "@/lib/form";
import { generateDealAbout } from "@/lib/ai-content";
import { AiBudgetError } from "@/lib/ai-budget";
import { ABOUT_MAX, ABOUT_MIN, cleanAbout, pickAboutCandidates } from "@/lib/deal-about";
import { siteCoupons } from "@/lib/public-site";
import type { Store } from "@/lib/db";

// Moderation of what readers contribute. Every action checks the role first and validates its ids.

function idOf(f: FormData): number {
  const id = couponIdOf(str(f, "id"));
  if (!id) throw new Error("Identificador no válido");
  return id;
}

function flagOfForm(f: FormData, key: string): 0 | 1 {
  const v = flagOf(str(f, key));
  if (v === null) throw new Error("Valor no válido");
  return v;
}

function refresh() {
  revalidatePath("/panel/moderacion");
  revalidatePath("/", "layout");
}

// One conditional UPDATE, so a double click or a stale page can't publish twice
export async function publishShared(f: FormData) {
  await requireEditor();
  const id = idOf(f);
  const rows = await sql()<{ title: string; handle: string | null }[]>`
    UPDATE coupons SET archived = 0, review = '', verified = 1
    WHERE id = ${id} AND shared_by IS NOT NULL AND review = 'pending'
    RETURNING title, (SELECT handle FROM readers WHERE id = coupons.shared_by) AS handle`;
  if (rows[0]) await logActivity(`Publicado el chollo compartido por @${rows[0].handle ?? "lector"}: ${rows[0].title}`);
  if (rows[0]) after(() => fillProductImages([id]));
  refresh();
}

export async function rejectShared(f: FormData) {
  await requireEditor();
  const id = idOf(f);
  await sql()`UPDATE coupons SET review = 'rejected' WHERE id = ${id} AND shared_by IS NOT NULL AND review = 'pending'`;
  refresh();
}

export async function setCommentHidden(f: FormData) {
  await requireEditor();
  const id = idOf(f);
  const hidden = flagOfForm(f, "hidden");
  await sql()`UPDATE comments SET hidden = ${hidden} WHERE id = ${id}`;
  refresh();
}

// Blocking also bumps session_version, so the reader's cookie stops working right away
export async function setReaderBlocked(f: FormData) {
  await requireEditor();
  const id = idOf(f);
  const blocked = flagOfForm(f, "blocked");
  if (blocked) {
    await sql()`UPDATE readers SET status = 'blocked', session_version = session_version + 1 WHERE id = ${id}`;
  } else {
    await sql()`UPDATE readers SET status = 'active' WHERE id = ${id}`;
  }
  refresh();
}

// "Avisos de caducado": readers say a deal stopped working. Retirar hides it from the site; the reports stay as its record.
export async function retireReported(f: FormData) {
  await requireEditor();
  const id = idOf(f);
  const rows = await sql()<{ title: string; n: number }[]>`
    UPDATE coupons SET archived = 1 WHERE id = ${id} AND archived = 0
    RETURNING title, (SELECT count(*)::int FROM expiry_reports WHERE coupon_id = coupons.id) AS n`;
  if (rows[0]) await logActivity(`Retirado por avisos de caducado (${rows[0].n}): ${rows[0].title}`);
  refresh();
}

// "Sigue activo": the editor checked it works, so its reports go (and the "Puede haber caducado" badge with them)
export async function dismissExpiryReports(f: FormData) {
  await requireEditor();
  const id = idOf(f);
  await sql()`DELETE FROM expiry_reports WHERE coupon_id = ${id}`;
  refresh();
}

// "Sobre este chollo": the AI drafts, an editor approves. Drafts are never public.
const ABOUT_BATCH = 10;

export type AboutDraftsState = { drafted?: number; error?: string };

// One deal at a time so the budget check runs before each call; stops at the first budget error
export async function draftDealAbouts(): Promise<AboutDraftsState> {
  await requireEditor();
  const picked = pickAboutCandidates(await siteCoupons(), ABOUT_BATCH);
  if (!picked.length) return { drafted: 0 };
  const storeIds = [...new Set(picked.map((c) => c.store_id))];
  const stores = new Map(
    (await sql()<Store[]>`SELECT * FROM stores WHERE id = ANY(${storeIds})`).map((s) => [s.id, { ...s }]),
  );
  let drafted = 0;
  let failed = 0;
  for (const c of picked) {
    const store = stores.get(c.store_id);
    if (!store) continue;
    try {
      const about = await generateDealAbout(c, store);
      await sql()`UPDATE coupons SET about = ${about}, about_status = 'draft' WHERE id = ${c.id} AND about_status = ''`;
      drafted += 1;
    } catch (e) {
      if (e instanceof AiBudgetError) {
        refresh();
        return { drafted, error: `${e.message}. Borradores creados: ${drafted}.` };
      }
      console.error("draftDealAbouts failed", c.id, e);
      failed += 1;
    }
  }
  if (drafted) await logActivity(`${drafted} borrador(es) de «Sobre este chollo» generados con IA`);
  refresh();
  return failed ? { drafted, error: `No se pudieron generar ${failed} texto(s). Revisa los registros.` } : { drafted };
}

export async function approveAbout(_prev: { error?: string }, f: FormData): Promise<{ error?: string }> {
  try {
    await requireEditor();
    const id = idOf(f);
    const about = cleanAbout(String(f.get("about") ?? ""));
    if (!about) return { error: `El texto debe tener entre ${ABOUT_MIN} y ${ABOUT_MAX} caracteres` };
    const rows = await sql()<{ title: string }[]>`
      UPDATE coupons SET about = ${about}, about_status = 'approved' WHERE id = ${id} AND about_status = 'draft' RETURNING title`;
    if (rows[0]) await logActivity(`Aprobado el texto de «${rows[0].title}»`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  refresh();
  return {};
}

export async function discardAbout(f: FormData) {
  await requireEditor();
  const id = idOf(f);
  await sql()`UPDATE coupons SET about = '', about_status = '' WHERE id = ${id} AND about_status = 'draft'`;
  refresh();
}
