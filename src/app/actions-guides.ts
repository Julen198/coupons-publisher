"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { requireAdmin, requireEditor } from "@/lib/auth";
import { guideSettings, scheduleGuide, storeSignals, writeGuide } from "@/lib/guides-cron";
import { scoreOf } from "@/lib/guide-rules";
import { pingIndexNow } from "@/lib/guide-index";

const storeIdOf = (f: FormData) => {
  const id = Number(f.get("store_id"));
  if (!Number.isInteger(id) || id <= 0) throw new Error("Tienda no válida");
  return id;
};

const done = (text: string) => Promise.all([logActivity(text), Promise.resolve(revalidatePath("/panel/guias"))]);

// Cancelar: a pending rewrite is dropped (the published guide stays); otherwise the guide never goes out (or comes off
// the page) and the store isn't proposed again
export async function rejectGuide(f: FormData) {
  await requireEditor();
  const id = storeIdOf(f);
  const [rewrite] = await sql()<{ name: string }[]>`
    UPDATE store_guides g SET draft = NULL FROM stores s WHERE s.id = g.store_id AND g.store_id = ${id} AND g.draft IS NOT NULL RETURNING s.name`;
  if (rewrite) return void (await done(`Reescritura de la guía SEO cancelada: ${rewrite.name}`));
  const [row] = await sql()<{ name: string; slug: string }[]>`
    UPDATE store_guides g SET status = 'rejected' FROM stores s WHERE s.id = g.store_id AND g.store_id = ${id} RETURNING s.name, s.slug`;
  if (row) revalidatePath(`/tiendas/${row.slug}`);
  await done(`Guía SEO cancelada: ${row?.name ?? id}`);
}

export async function publishGuideNow(f: FormData) {
  await requireEditor();
  const id = storeIdOf(f);
  const [row] = await sql()<{ name: string; slug: string }[]>`
    UPDATE store_guides g SET status = 'published', published_at = now(), publish_at = now(),
      content = COALESCE(g.draft, g.content), draft = NULL,
      rewritten_at = CASE WHEN g.draft IS NOT NULL THEN now() ELSE g.rewritten_at END
    FROM stores s
    WHERE s.id = g.store_id AND g.store_id = ${id} AND (g.status = 'scheduled' OR g.draft IS NOT NULL) RETURNING s.name, s.slug`;
  if (row) {
    revalidatePath(`/tiendas/${row.slug}`);
    await pingIndexNow([`/tiendas/${row.slug}`, "/", "/llms.txt"]);
  }
  await done(`Guía SEO publicada a mano: ${row?.name ?? id}`);
}

// Escribir / Reescribir: a new guide for this store now, with the usual wait before it goes out
export async function writeGuideNow(f: FormData) {
  await requireEditor();
  const id = storeIdOf(f);
  const [store] = await sql()<{ slug: string; name: string }[]>`SELECT slug, name FROM stores WHERE id = ${id}`;
  if (!store) throw new Error("Tienda no encontrada");
  const [settings, signals] = await Promise.all([guideSettings(), storeSignals()]);
  const out = await writeGuide(store.slug);
  if (!out.guide || out.problems.length) throw new Error(`No se pudo escribir la guía: ${out.problems.join("; ")}`);
  const s = signals.find((x) => x.storeId === id);
  await scheduleGuide(id, out.guide, s ? { ...s, score: scoreOf(s) } : {}, settings.delayHours);
  await done(`Guía SEO escrita para ${store.name}`);
}

export async function saveGuideSettings(f: FormData) {
  await requireAdmin();
  const pairs: [string, string][] = [
    ["guides_enabled", f.get("enabled") === "on" ? "1" : "0"],
    ["guides_min_live", String(Number(f.get("min_live")))],
    ["guides_per_day", String(Number(f.get("per_day")))],
    ["guides_delay_hours", String(Number(f.get("delay_hours")))],
  ];
  for (const [key, value] of pairs) {
    await sql()`INSERT INTO settings (key, value) VALUES (${key}, ${value}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  }
  await done("Ajustes de guías SEO guardados"); // settingsOf clamps whatever was typed
}
