// The panel assistant: answers the admin chat's free-text questions on Telegram with read-only tools over the same
// data the panel shows. It never changes anything (no write tools on purpose; actions would need ✅/❌ buttons).
import { generateText, isStepCount, tool } from "ai";
import { z } from "zod";
import { sql } from "./db";
import { track } from "./ai-content";
import { assertWithinBudget, aiLimits, monthSpent, usageSince } from "./ai-budget";
import { byFeature, FEATURE_INFO } from "./ai-costs";
import { MODEL } from "./ai-model.ts";
import { clickStats } from "./clicks";
import { guideRows, nextCandidates } from "./guides-cron";
import { siteCoupons } from "./public-site";
import { loadStats, rangeOf } from "./stats";
import { madridToday } from "./site-text";

const round = (v: number | null, d = 1) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

const tools = {
  estadisticas: tool({
    description: "Estadísticas de la web en un periodo: Search Console (impresiones, clics, posición, búsquedas), visitas GA4, clics a tiendas y copias por origen, tiendas con más actividad, guías y coste de IA, con el periodo anterior para comparar.",
    inputSchema: z.object({ dias: z.union([z.literal(7), z.literal(28), z.literal(90)]).describe("Periodo en días") }),
    execute: async ({ dias }) => {
      const s = await loadStats(rangeOf(dias));
      return {
        periodo: s.range, fuentes: s.sources, actual: { ...s.cur, position: round(s.cur.position) }, anterior: { ...s.prev, position: round(s.prev.position) },
        busquedas: s.queries.map((q) => ({ ...q, position: round(q.position) })),
        origenes: s.origins, tiendas: s.stores.map((t) => ({ ...t, position: round(t.position) })), guias: s.guides, costeIA: round(s.aiCost, 2),
      };
    },
  }),
  guias: tool({
    description: "Guías SEO automáticas: programadas (con fecha de publicación), publicadas, canceladas o fallidas, y las próximas tiendas candidatas con su puntuación.",
    inputSchema: z.object({}),
    execute: async () => ({
      guias: (await guideRows()).map((g) => ({
        tienda: g.name, estado: g.status, keyword: g.content.keyword, publicaEl: g.publish_at, publicadaEl: g.published_at,
        reescrituraPendiente: !!g.draft, problemas: g.signals.problems ?? [],
      })),
      candidatas: await nextCandidates(10),
    }),
  }),
  tienda: tool({
    description: "Ficha de una tienda por nombre: red, país, cupones activos en la web, clics de los últimos 30 días y su guía.",
    inputSchema: z.object({ nombre: z.string().describe("Nombre o parte del nombre de la tienda") }),
    execute: async ({ nombre }) => {
      const like = `%${nombre.trim()}%`;
      const stores = await sql()<{ id: number; name: string; slug: string; network: string; country: string; guide: string | null }[]>`
        SELECT s.id, s.name, s.slug, s.network, s.country, g.status AS guide FROM stores s LEFT JOIN store_guides g ON g.store_id = s.id
        WHERE s.name ILIKE ${like} OR s.slug ILIKE ${like} ORDER BY length(s.name) LIMIT 3`;
      if (!stores.length) return { error: `No hay ninguna tienda que se llame como «${nombre}»` };
      const [live, clicks] = await Promise.all([
        siteCoupons(),
        sql()<{ store_id: number; kind: string; n: number }[]>`
          SELECT store_id, kind, count(*)::int AS n FROM clicks WHERE at > now() - interval '30 days' AND store_id IN ${sql()(stores.map((s) => s.id))} GROUP BY 1, 2`,
      ]);
      return stores.map((s) => ({
        ...s, pagina: `/tiendas/${s.slug}`,
        cuponesActivos: live.filter((c) => c.store_id === s.id).map((c) => ({ titulo: c.display_title, tipo: c.kind, codigo: c.code, descuento: c.discount, caduca: c.expires_at || "sin fecha" })),
        clics30d: Object.fromEntries(clicks.filter((c) => c.store_id === s.id).map((c) => [c.kind, c.n])),
      }));
    },
  }),
  buscarCupones: tool({
    description: "Busca cupones (también archivados o caducados) por texto en el título, el código o la tienda.",
    inputSchema: z.object({ texto: z.string() }),
    execute: async ({ texto }) => {
      const like = `%${texto.trim()}%`;
      const today = madridToday().iso;
      const rows = await sql()<{ id: number; title: string; code: string; discount: string; expires_at: string; archived: number; review: string; store: string }[]>`
        SELECT c.id, c.title, c.code, c.discount, c.expires_at, c.archived, c.review, s.name AS store FROM coupons c JOIN stores s ON s.id = c.store_id
        WHERE c.title ILIKE ${like} OR c.code ILIKE ${like} OR s.name ILIKE ${like} ORDER BY c.archived, c.id DESC LIMIT 15`;
      return rows.map((r) => ({ ...r, estado: r.archived ? "archivado" : r.review ? `revisión: ${r.review}` : r.expires_at && r.expires_at < today ? "caducado" : "activo" }));
    },
  }),
  clics: tool({
    description: "Clics a tiendas en los últimos N días: total, periodo anterior, por tipo (go, copy, untracked), por medio, por tienda, por origen y cupones con más clics.",
    inputSchema: z.object({ dias: z.number().int().min(1).max(400) }),
    execute: async ({ dias }) => {
      const s = await clickStats(dias);
      return { ...s, byDay: undefined, byStore: s.byStore.slice(0, 15), topCoupons: s.topCoupons.slice(0, 10) };
    },
  }),
  costesIA: tool({
    description: "Gasto de IA: lo gastado este mes, el presupuesto mensual y el gasto de los últimos 30 días por función.",
    inputSchema: z.object({}),
    execute: async () => {
      const [spent, limits, rows] = await Promise.all([monthSpent(), aiLimits(), usageSince(30)]);
      const f = byFeature(rows);
      return { mes: round(spent, 2), presupuesto: limits.budget, ultimos30: Object.entries(f).map(([k, v]) => ({ funcion: FEATURE_INFO[k as keyof typeof f].label, llamadas: v.calls, coste: round(v.cost, 2) })) };
    },
  }),
  moderacion: tool({
    description: "Lo pendiente de moderar: chollos compartidos por lectores, cupones marcados como caducados, textos «Sobre este chollo» en borrador y chollos por revisar en Telegram.",
    inputSchema: z.object({}),
    execute: async () => {
      const [[r]] = await Promise.all([sql()<{ shared: number; reported: number; drafts: number; telegram: number }[]>`
        SELECT (SELECT count(*)::int FROM coupons WHERE shared_by IS NOT NULL AND review = 'pending') AS shared,
               (SELECT count(DISTINCT e.coupon_id)::int FROM expiry_reports e JOIN coupons c ON c.id = e.coupon_id WHERE c.archived = 0) AS reported,
               (SELECT count(*)::int FROM coupons WHERE about_status = 'draft') AS drafts,
               (SELECT count(*)::int FROM coupons WHERE telegram_status = 'review') AS telegram`]);
      return { chollosCompartidosPendientes: r.shared, cuponesMarcadosCaducados: r.reported, borradoresSobreEsteChollo: r.drafts, chollosEnRevisionTelegram: r.telegram };
    },
  }),
};

const SYSTEM = [
  "Eres el asistente del panel de CuponLab (web de cupones y chollos verificados, cuponlab.com). Respondes por Telegram al administrador.",
  "Usa las herramientas para cualquier dato: nunca inventes cifras. Si una herramienta no da el dato, dilo.",
  "Solo puedes consultar. Si te piden cambiar algo (publicar, cancelar, borrar), explica que eso se hace en el panel (cuponlab.com/panel) y di dónde.",
  "Responde en español de España, breve y directo: primero la respuesta, luego 2-5 datos que la apoyen. Sin tablas Markdown ni negritas: texto plano con guiones.",
  "Cifras con separador de miles español. Fechas en hora de Madrid. Search Console llega con 2-3 días de retraso; GA4 solo cuenta a quien acepta cookies.",
].join("\n");

// Telegram's limit is 4096 characters per message
export const TELEGRAM_MAX = 4000;
export const forTelegram = (text: string): string => {
  const t = text.trim() || "No he sabido responder a eso.";
  return t.length > TELEGRAM_MAX ? `${t.slice(0, TELEGRAM_MAX - 1)}…` : t;
};

// One question (plus the bot message it replies to, if any) → the answer text
export async function askPanel(question: string, replyingTo?: string): Promise<string> {
  await assertWithinBudget();
  const today = madridToday();
  const prompt = [replyingTo ? `Contexto, el mensaje al que responde:\n${replyingTo.slice(0, 1500)}\n` : "", `Hoy es ${today.iso}.`, `Pregunta: ${question}`].filter(Boolean).join("\n");
  const { text } = await track("assistant", question.slice(0, 120), () => generateText({ model: MODEL, system: SYSTEM, prompt, tools, stopWhen: isStepCount(8) }));
  return forTelegram(text);
}
