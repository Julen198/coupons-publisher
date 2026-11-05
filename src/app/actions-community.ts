"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { requireEditor } from "@/lib/auth";
import { couponIdOf, flagOf } from "@/lib/community";
import { str } from "@/lib/form";

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
