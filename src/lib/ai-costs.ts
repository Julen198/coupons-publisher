// Spend accounting for AI calls through the Vercel AI Gateway. Pure helpers, the DB part lives in ai-content.ts.
// cost = what the Gateway bills (web searches; tokens go to our own Anthropic key, BYOK)
// marketCost = full list price of the call (tokens + searches) → what we report as "gasto"

export const AI_FEATURES = ["search", "content", "style", "stores", "translate"] as const;
export type AiFeature = (typeof AI_FEATURES)[number];

export const FEATURE_INFO: Record<AiFeature, { label: string; what: string }> = {
  search: { label: "Búsqueda de cupones", what: "Claude Haiku + búsqueda web, por tienda" },
  content: { label: "Contenido y FAQs", what: "Claude Haiku: intro y preguntas de cada tienda" },
  style: { label: "Estilo de la demo", what: "Claude Haiku: lee la web del cliente" },
  stores: { label: "Lista de tiendas", what: "Claude Haiku: convierte lo que pegas en tiendas" },
  translate: { label: "Traducciones", what: "Claude Haiku: títulos y condiciones de cupones en otros idiomas" },
};

// The monthly limits set in Costes de IA (settings ai_budget, ai_alert and ai_pause_search), with their defaults
export interface AiLimits { budget: number; alert: number; pauseSearch: boolean }
export const DEFAULT_LIMITS: AiLimits = { budget: 25, alert: 80, pauseSearch: true };

export function limitsFrom(v: Record<string, string | undefined>): AiLimits {
  return {
    budget: Number(v.ai_budget) > 0 ? Number(v.ai_budget) : DEFAULT_LIMITS.budget,
    alert: [50, 80, 100].includes(Number(v.ai_alert)) ? Number(v.ai_alert) : DEFAULT_LIMITS.alert,
    pauseSearch: v.ai_pause_search ? v.ai_pause_search === "1" : DEFAULT_LIMITS.pauseSearch,
  };
}

export interface UsageRow {
  at: Date; feature: AiFeature; about: string; user_name: string;
  input_tokens: number; output_tokens: number; web_searches: number; cost_total: number; cost_gateway: number; ok: boolean;
  estimated?: boolean;
}

type StepLike = { usage?: { inputTokens?: number; outputTokens?: number }; providerMetadata?: Record<string, Record<string, unknown> | undefined> };

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

export function usageOf(steps: StepLike[]) {
  let input = 0, output = 0, searches = 0, cost = 0, gatewayCost = 0;
  for (const s of steps) {
    input += s.usage?.inputTokens ?? 0;
    output += s.usage?.outputTokens ?? 0;
    const g = s.providerMetadata?.gateway ?? {};
    const tools = (g.gatewayToolCalls ?? {}) as Record<string, unknown>;
    searches += Object.values(tools).reduce<number>((a, b) => a + num(b), 0);
    gatewayCost += num(g.cost);
    cost += num(g.marketCost ?? g.cost);
  }
  return { input, output, searches, cost: round6(cost), gatewayCost: round6(gatewayCost) };
}

export const madridDay = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });

export function byFeature(rows: UsageRow[]) {
  const out = Object.fromEntries(AI_FEATURES.map((f) => [f, { calls: 0, input: 0, output: 0, searches: 0, cost: 0, gatewayCost: 0 }])) as Record<
    AiFeature,
    { calls: number; input: number; output: number; searches: number; cost: number; gatewayCost: number }
  >;
  for (const r of rows) {
    const f = out[r.feature];
    if (!f) continue;
    f.calls += 1;
    f.input += r.input_tokens;
    f.output += r.output_tokens;
    f.searches += r.web_searches;
    f.cost += r.cost_total;
    f.gatewayCost += r.cost_gateway;
  }
  return out;
}

export function dailyByFeature(rows: UsageRow[], days: string[]) {
  const map = new Map(days.map((day) => [day, { day, search: 0, content: 0, style: 0, stores: 0, translate: 0 }]));
  for (const r of rows) {
    const d = map.get(madridDay(r.at));
    if (d) d[r.feature] += r.cost_total;
  }
  return [...map.values()];
}

export function monthForecast(spent: number, now: Date) {
  const day = Number(madridDay(now).slice(8, 10));
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return (spent / day) * daysInMonth;
}

export const usd = (v: number, digits = 2) =>
  v.toLocaleString("es-ES", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits });
