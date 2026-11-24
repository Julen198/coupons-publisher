import { test } from "node:test";
import assert from "node:assert/strict";
import { aiSourceOf, callTool, handleRpc, matchScore, searchTerms, sessionIdFor, sourceOfSession, storeMatches, toolList, type McpData, type McpDeal } from "./mcp.ts";

const deal = (over: Partial<McpDeal>): McpDeal => ({
  id: 1, store: "Nike", store_slug: "nike", category: "zapatillas", kind: "code", title: "10% en zapatillas", description: "", code: "NIKE10",
  discount: "10%", expires_at: "2026-11-30", verified: 1, score: 0, comments: 0, uses_week: 0, brands: ["nike"], perk: false, ...over,
});

const DEALS = [
  deal({}),
  deal({ id: 2, store: "El Corte Inglés", store_slug: "el-corte-ingles", category: "moda", title: "20% en abrigos", code: "ECI20", discount: "20%", brands: [], score: 5 }),
  deal({ id: 3, store: "PcComponentes", store_slug: "pccomponentes", category: "tecnologia", kind: "deal", title: "Portátiles rebajados", code: "", discount: "Hasta 30%", brands: [], score: 9 }),
  deal({ id: 4, store: "Nike", store_slug: "nike", title: "Envío gratis con Nike Members", kind: "deal", code: "", discount: "", perk: true }),
];

const data: McpData = {
  deals: async () => DEALS,
  pageUrl: (d, s) => `https://cuponlab.test/chollos/${d.id}?utm_source=${s}`,
  goUrl: (d, s) => `https://cuponlab.test/go/cuponlab/${d.id}?o=${s}`,
  storeUrl: (slug, s) => `https://cuponlab.test/tiendas/${slug}?utm_source=${s}`,
  today: () => "2026-11-24",
  siteUrl: "https://cuponlab.test",
};

test("aiSourceOf / session ids: which assistant is calling, carried by the session id", () => {
  assert.equal(aiSourceOf("claude-ai"), "claude");
  assert.equal(aiSourceOf("", "openai-mcp/1.0.0"), "chatgpt");
  assert.equal(aiSourceOf("cursor", null), "ia");
  const id = sessionIdFor("chatgpt", "3f2a-9c");
  assert.equal(id, "chatgpt.3f2a9c");
  assert.equal(sourceOfSession(id), "chatgpt");
  assert.equal(sourceOfSession("evil.x"), "");
  assert.equal(sourceOfSession(null), "");
});

test("searchTerms drops filler words and accents", () => {
  assert.deepEqual(searchTerms("Código descuento zapatillas Nike"), ["zapatillas", "nike"]);
  assert.deepEqual(searchTerms("cupones para portátil"), ["portatil"]);
});

test("matchScore: every term must match; the store's name counts most", () => {
  assert.ok(matchScore(DEALS[0], ["nike"]) > matchScore(DEALS[0], ["zapatillas"]));
  assert.equal(matchScore(DEALS[0], ["nike", "abrigos"]), 0);
  assert.ok(matchScore(DEALS[1], ["moda"]) > 0); // its category
});

test("storeMatches: name with or without accents and spaces", () => {
  assert.deepEqual(storeMatches(DEALS, "el corte ingles"), ["el-corte-ingles"]);
  assert.deepEqual(storeMatches(DEALS, "corte"), ["el-corte-ingles"]);
  assert.deepEqual(storeMatches(DEALS, "amazon"), []);
});

test("search_coupons: results carry the code, the tracked link with the assistant as origin, and the disclosure", async () => {
  const r = await callTool("search_coupons", { query: "zapatillas nike" }, data, "claude");
  assert.equal(r.isError, undefined);
  const coupons = r.structuredContent!.coupons as { id: number; code: string; link: string }[];
  assert.deepEqual(coupons.map((c) => c.id), [1, 4]);
  assert.equal(coupons[0].code, "NIKE10");
  assert.equal(coupons[0].link, "https://cuponlab.test/go/cuponlab/1?o=claude");
  assert.match(r.content[0].text, /NIKE10/);
  assert.match(r.content[0].text, /afiliado/);
});

test("search_coupons: an unknown store says there's nothing instead of making a coupon up", async () => {
  const r = await callTool("search_coupons", { store: "Amazon" }, data, "chatgpt");
  assert.deepEqual(r.structuredContent!.coupons, []);
  assert.match(r.content[0].text, /no tiene/);
});

test("search_coupons: only_codes and store filters", async () => {
  const r = await callTool("search_coupons", { store: "nike", only_codes: true }, data, "ia");
  assert.deepEqual((r.structuredContent!.coupons as { id: number }[]).map((c) => c.id), [1]);
});

test("top_deals: by votes, standing offers left out, category filter", async () => {
  const all = await callTool("top_deals", {}, data, "claude");
  assert.deepEqual((all.structuredContent!.coupons as { id: number }[]).map((c) => c.id), [3, 2, 1]);
  const tech = await callTool("top_deals", { category: "tecnologia", limit: 1 }, data, "claude");
  assert.deepEqual((tech.structuredContent!.coupons as { id: number }[]).map((c) => c.id), [3]);
});

test("get_coupon and list_stores", async () => {
  const one = await callTool("get_coupon", { id: 2 }, data, "claude");
  assert.equal((one.structuredContent!.coupon as { store: string }).store, "El Corte Inglés");
  assert.equal((await callTool("get_coupon", { id: 99 }, data, "claude")).isError, true);
  const stores = await callTool("list_stores", {}, data, "claude");
  assert.deepEqual((stores.structuredContent!.stores as { store: string; coupons: number }[])[0], { store: "Nike", coupons: 2, codes: 1, page: "https://cuponlab.test/tiendas/nike?utm_source=claude" });
});

test("bad arguments are a readable tool error, not a crash", async () => {
  const r = await callTool("top_deals", { category: "coches" }, data, "claude");
  assert.equal(r.isError, true);
  assert.equal((await callTool("nope", {}, data, "claude")).isError, true);
});

test("tools/list: read-only tools with JSON Schema inputs", () => {
  const tools = toolList();
  assert.deepEqual(tools.map((t) => t.name), ["search_coupons", "top_deals", "get_coupon", "list_stores"]);
  for (const t of tools) {
    assert.equal(t.annotations.readOnlyHint, true);
    assert.equal((t.inputSchema as { type: string }).type, "object");
  }
});

test("JSON-RPC: initialize, notifications, unknown methods, tools/call", async () => {
  const init = await handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", clientInfo: { name: "claude-ai" } } }, data, "claude");
  const result = init!.result as { protocolVersion: string; capabilities: { tools: unknown }; instructions: string };
  assert.equal(result.protocolVersion, "2025-06-18");
  assert.ok(result.capabilities.tools);
  assert.match(result.instructions, /search_coupons/);
  const future = await handleRpc({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "2099-01-01" } }, data, "ia");
  assert.equal((future!.result as { protocolVersion: string }).protocolVersion, "2025-11-25");
  assert.equal(await handleRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, data, "ia"), null);
  assert.equal((await handleRpc({ jsonrpc: "2.0", id: 3, method: "sampling/x" }, data, "ia"))!.error!.code, -32601);
  assert.equal((await handleRpc("nope", data, "ia"))!.error!.code, -32600);
  const call = await handleRpc({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "top_deals", arguments: { limit: 1 } } }, data, "chatgpt");
  assert.match(JSON.stringify(call!.result), /o=chatgpt/);

  const broken = { ...data, deals: async () => { throw new Error("db down"); } };
  const down = await handleRpc({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "top_deals" } }, broken, "ia");
  assert.equal((down!.result as { isError: boolean }).isError, true);
});
