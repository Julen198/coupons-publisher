import { test } from "node:test";
import assert from "node:assert/strict";
import { byFeature, dailyByFeature, monthForecast, usageOf, type UsageRow } from "./ai-costs.ts";

test("usageOf adds tokens, web searches and both costs across steps", () => {
  const steps = [
    { usage: { inputTokens: 2000, outputTokens: 60 }, providerMetadata: { gateway: { cost: "0.005", marketCost: "0.0076", gatewayToolCalls: { perplexity_search: 1 } } } },
    { usage: { inputTokens: 3000, outputTokens: 400 }, providerMetadata: { gateway: { cost: "0", marketCost: "0.0045" } } },
    { usage: {}, providerMetadata: undefined },
  ];
  assert.deepEqual(usageOf(steps), { input: 5000, output: 460, searches: 1, cost: 0.0121, gatewayCost: 0.005 });
});

const row = (at: string, feature: UsageRow["feature"], cost: number, extra: Partial<UsageRow> = {}): UsageRow => ({
  at: new Date(at), feature, about: "", user_name: "julen", input_tokens: 100, output_tokens: 10, web_searches: 0, cost_total: cost, cost_gateway: 0, ok: true, ...extra,
});

test("byFeature and dailyByFeature group spend (days in Madrid time)", () => {
  const rows = [
    row("2026-10-23T22:30:00Z", "search", 0.03, { web_searches: 3 }), // 24 Oct in Madrid
    row("2026-10-24T10:00:00Z", "search", 0.02, { web_searches: 2 }),
    row("2026-10-24T11:00:00Z", "content", 0.004),
    row("2026-10-24T12:00:00Z", "style", 0, { ok: false }),
  ];
  const f = byFeature(rows);
  assert.equal(f.search.calls, 2);
  assert.equal(f.search.searches, 5);
  assert.equal(Math.round(f.search.cost * 1000), 50);
  assert.equal(f.style.calls, 1);
  assert.equal(f.stores.calls, 0);
  const days = dailyByFeature(rows, ["2026-10-23", "2026-10-24"]);
  assert.deepEqual(days.map((d) => [d.day, Math.round(d.search * 1000), Math.round(d.content * 1000)]), [["2026-10-23", 0, 0], ["2026-10-24", 50, 4]]);
});

test("monthForecast projects the month from the days elapsed", () => {
  assert.equal(monthForecast(12.4, new Date("2026-10-24T12:00:00Z")), 12.4 / 24 * 31);
});
