import { io } from "next/cache";
import { sql } from "./db";
import { limitsFrom, type AiLimits, type UsageRow } from "./ai-costs";

export async function aiLimits(): Promise<AiLimits> {
  await io();
  const rows = await sql()<{ key: string; value: string }[]>`SELECT key, value FROM settings WHERE key IN ('ai_budget', 'ai_alert', 'ai_pause_search')`;
  return limitsFrom(Object.fromEntries(rows.map((r) => [r.key, r.value])));
}

// Spend since the 1st of this month (Madrid time), in USD at list price
export async function monthSpent(): Promise<number> {
  await io();
  const [row] = await sql()<{ total: number }[]>`
    SELECT coalesce(sum(cost_total), 0)::float AS total FROM ai_usage
    WHERE at >= date_trunc('month', now() AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'Europe/Madrid'`;
  return row.total;
}

// The bulk coupon search is what burns money: it stops when the month is over budget (if the admin chose so)
export async function searchBlocked(): Promise<boolean> {
  const [limits, spent] = await Promise.all([aiLimits(), monthSpent()]);
  return limits.pauseSearch && spent >= limits.budget;
}

// Optional AI jobs (deal texts) stop at the monthly budget, whatever the search setting says
export class AiBudgetError extends Error {
  constructor() {
    super("Presupuesto de IA del mes superado (Costes de IA): no se generan más textos");
    this.name = "AiBudgetError";
  }
}

export async function assertWithinBudget(): Promise<void> {
  const [limits, spent] = await Promise.all([aiLimits(), monthSpent()]);
  if (spent >= limits.budget) throw new AiBudgetError();
}

export async function usageSince(days: number): Promise<UsageRow[]> {
  await io();
  const rows = await sql()<UsageRow[]>`
    SELECT at, feature, about, user_name, input_tokens, output_tokens, web_searches, cost_total, cost_gateway, ok, estimated
    FROM ai_usage WHERE at >= now() - ${days} * interval '1 day' ORDER BY at`;
  return rows.map((r) => ({ ...r }));
}
