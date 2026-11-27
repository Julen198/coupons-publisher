"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { requireAdmin, requireEditor } from "@/lib/auth";
import { campaignSettings, ensureCampaignTables, publishCampaignNow as publishNow, runCampaignsCron, scheduleCampaign, writeCampaign } from "@/lib/campaigns-cron";
import { daysFrom, delayFor } from "@/lib/campaign-rules";
import { eventEdition, eventPageOf, storeEventPath } from "@/lib/event-pages";
import { pingIndexNow } from "@/lib/guide-index";
import { madridToday } from "@/lib/site-text";

const keyOf = (f: FormData) => {
  const id = Number(f.get("store_id"));
  const event = String(f.get("event") ?? "");
  if (!Number.isInteger(id) || id <= 0 || !eventPageOf(event)) throw new Error("Página no válida");
  return { id, event };
};

const done = (text: string) => Promise.all([logActivity(text), Promise.resolve(revalidatePath("/panel/campanas"))]);

// Cancelar / Quitar de la web: the text never goes out (or comes off the page); the store isn't proposed again this year
export async function rejectCampaign(f: FormData) {
  await requireEditor();
  const { id, event } = keyOf(f);
  const [row] = await sql()<{ name: string; slug: string }[]>`
    UPDATE campaign_guides g SET status = 'rejected' FROM stores s WHERE s.id = g.store_id AND g.store_id = ${id} AND g.event = ${event} RETURNING s.name, s.slug`;
  if (row) revalidatePath(storeEventPath(event, row.slug));
  await done(`Página de campaña cancelada: ${eventPageOf(event)?.name} ${row?.name ?? id}`);
}

export async function publishCampaignNow(f: FormData) {
  await requireEditor();
  const { id, event } = keyOf(f);
  const [row] = await sql()<{ name: string; slug: string }[]>`
    UPDATE campaign_guides g SET status = 'published', published_at = now(), publish_at = now() FROM stores s
    WHERE s.id = g.store_id AND g.store_id = ${id} AND g.event = ${event} AND g.status = 'scheduled' RETURNING s.name, s.slug`;
  if (row) {
    revalidatePath(storeEventPath(event, row.slug));
    await pingIndexNow([storeEventPath(event, row.slug), `/ofertas/${event}`]);
  }
  await done(`Página de campaña publicada a mano: ${eventPageOf(event)?.name} ${row?.name ?? id}`);
}

// Escribir / Reescribir: a new text for this store and date now, with the usual wait
export async function writeCampaignNow(f: FormData) {
  await requireEditor();
  await ensureCampaignTables();
  const { id, event } = keyOf(f);
  const [store] = await sql()<{ slug: string; name: string }[]>`SELECT slug, name FROM stores WHERE id = ${id}`;
  if (!store) throw new Error("Tienda no encontrada");
  const queries = String(f.get("queries") ?? "").split("\n").map((q) => q.trim()).filter(Boolean);
  const out = await writeCampaign({ storeId: id, slug: store.slug, event, queries });
  if (!out.guide || out.problems.length) throw new Error(`No se pudo escribir: ${out.problems.join("; ")}`);
  const settings = await campaignSettings();
  const today = madridToday().iso;
  const days = daysFrom(today, eventEdition(eventPageOf(event)!, today).date);
  const delay = delayFor(days, settings);
  await scheduleCampaign(id, event, out.year, out.guide, { reason: "a mano", queries }, delay);
  if (delay === 0) {
    await publishNow(id, event, store.slug);
    revalidatePath(storeEventPath(event, store.slug));
  }
  await done(`Página de campaña escrita: ${eventPageOf(event)?.name} ${store.name}`);
}

// «Ejecutar ahora»: the same run as the cron (publish, plan, write, detect, reports)
export async function runCampaignsNow() {
  await requireAdmin();
  const r = await runCampaignsCron();
  await done(`Campañas ejecutadas a mano: ${r.scheduled.length} escritas, ${r.published.length} publicadas`);
}

export async function saveCampaignSettings(f: FormData) {
  await requireAdmin();
  const pairs: [string, string][] = [
    ["campaigns_enabled", f.get("enabled") === "on" ? "1" : "0"],
    ["campaigns_per_day", String(Number(f.get("per_day")))],
    ["campaigns_delay_hours", String(Number(f.get("delay_hours")))],
    ["campaigns_lead_days", String(Number(f.get("lead_days")))],
    ["campaigns_stores_per_event", String(Number(f.get("stores_per_event")))],
  ];
  for (const [key, value] of pairs)
    await sql()`INSERT INTO settings (key, value) VALUES (${key}, ${value}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  await done("Ajustes de campañas guardados");
}
