"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { requireEditor } from "@/lib/auth";
import { moderationId } from "@/lib/community-rules";
import { errorMessage, str } from "@/lib/form";
import { cleanTranslationInput } from "@/lib/translation";
import { isMissingTranslation, MISSING_COLUMNS } from "@/lib/translation-column";

// Editors' side of the AI translations (translation.ts): edit and approve, approve as is, "No traducir", translate again.
// Every action checks the role and the id; the Spanish text is shown publicly only while it translates the current original.

export type TranslationState = { error?: string; saved?: boolean };

const idOf = (f: FormData): number => moderationId(str(f, "id"));

function refresh() {
  revalidatePath("/panel/coupons");
  revalidatePath("/panel/stores", "layout");
  revalidatePath("/panel/moderacion");
  revalidatePath("/", "layout");
}

const failure = (e: unknown): TranslationState => ({ error: isMissingTranslation(e) ? MISSING_COLUMNS : errorMessage(e) });

// The editor's text becomes the approved translation of the original as it is now
export async function saveTranslation(f: FormData): Promise<TranslationState> {
  try {
    await requireEditor();
    const id = idOf(f);
    const { title_es, description_es } = cleanTranslationInput(str(f, "title_es"), str(f, "description_es"));
    const rows = await sql()<{ title: string }[]>`
      UPDATE coupons SET title_es = ${title_es}, description_es = ${description_es}, translation_status = 'approved',
        translated_from = md5(title || chr(10) || description)
      WHERE id = ${id} RETURNING title`;
    if (!rows[0]) return { error: "Cupón no encontrado" };
    await logActivity(`Traducción revisada: «${title_es}»`);
  } catch (e) {
    return failure(e);
  }
  refresh();
  return { saved: true };
}

// "No traducir": readers see the original; no run translates it again. "Volver a traducir" undoes it.
export async function setTranslationSkipped(f: FormData): Promise<TranslationState> {
  try {
    await requireEditor();
    const id = idOf(f);
    if (str(f, "skip") === "1") {
      await sql()`UPDATE coupons SET translation_status = 'skip' WHERE id = ${id}`;
    } else {
      // translated_from '' = not checked: the next network sync or scripts/translate-coupons.ts translates it
      await sql()`UPDATE coupons SET translation_status = '', title_es = '', description_es = '', translated_from = '' WHERE id = ${id} AND translation_status = 'skip'`;
    }
  } catch (e) {
    return failure(e);
  }
  refresh();
  return {};
}

// Aprobar from the moderation page: the automatic translation, as it is, if it still translates the original
export async function approveTranslation(f: FormData) {
  await requireEditor();
  const id = idOf(f);
  try {
    await sql()`
      UPDATE coupons SET translation_status = 'approved'
      WHERE id = ${id} AND translation_status = 'auto' AND translated_from = md5(title || chr(10) || description)`;
  } catch (e) {
    if (!isMissingTranslation(e)) throw e;
    console.error("[approveTranslation]", MISSING_COLUMNS);
  }
  refresh();
}
