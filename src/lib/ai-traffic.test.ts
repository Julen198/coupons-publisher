import { test } from "node:test";
import assert from "node:assert/strict";
import { aiBotOf, assistantOfSource, botPath, mcpQueryOf } from "./ai-traffic.ts";

test("assistantOfSource: referrer hosts and utm sources of the assistants; anything else is null", () => {
  assert.equal(assistantOfSource("chatgpt.com"), "ChatGPT");
  assert.equal(assistantOfSource("chatgpt"), "ChatGPT"); // our MCP links
  assert.equal(assistantOfSource("chat.openai.com"), "ChatGPT");
  assert.equal(assistantOfSource("perplexity.ai"), "Perplexity");
  assert.equal(assistantOfSource("gemini.google.com"), "Gemini");
  assert.equal(assistantOfSource("claude.ai"), "Claude");
  assert.equal(assistantOfSource("claude"), "Claude");
  assert.equal(assistantOfSource("copilot.microsoft.com"), "Copilot");
  assert.equal(assistantOfSource("ia"), "Otros");
  for (const s of ["google", "bing", "(direct)", "telegram", "t.co", "chatgptclone.example"]) assert.equal(assistantOfSource(s), null, s);
});

test("aiBotOf: each assistant's live fetcher, search crawler and trainer apart; browsers are null", () => {
  const ua = (s: string) => `Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ${s}; +https://example.com/bot)`;
  assert.deepEqual(aiBotOf(ua("ChatGPT-User/1.0")), { id: "ChatGPT-User", who: "OpenAI", kind: "live" });
  assert.equal(aiBotOf(ua("OAI-SearchBot/1.0"))?.kind, "search");
  assert.equal(aiBotOf(ua("GPTBot/1.1"))?.kind, "training");
  assert.equal(aiBotOf(ua("Claude-User/1.0"))?.id, "Claude-User");
  assert.equal(aiBotOf(ua("Claude-SearchBot/1.0"))?.id, "Claude-SearchBot");
  assert.equal(aiBotOf(ua("ClaudeBot/1.0"))?.id, "ClaudeBot");
  assert.equal(aiBotOf(ua("Perplexity-User/1.0"))?.kind, "live");
  assert.equal(aiBotOf(ua("PerplexityBot/1.0"))?.kind, "search");
  assert.equal(aiBotOf(ua("bingbot/2.0"))?.id, "bingbot");
  assert.equal(aiBotOf("Googlebot-Image/1.0")?.id, "Googlebot");
  assert.equal(aiBotOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"), null);
  assert.equal(aiBotOf(""), null);
  assert.equal(aiBotOf(null), null);
});

test("botPath: no query string, never empty, at most 200 characters", () => {
  assert.equal(botPath("/tiendas/shein?utm_source=x"), "/tiendas/shein");
  assert.equal(botPath(""), "/");
  assert.equal(botPath(`/${"a".repeat(300)}`).length, 200);
});

test("mcpQueryOf: the search, else the store or category, else the coupon id", () => {
  assert.equal(mcpQueryOf({ query: "  Zapatillas   NIKE " }), "zapatillas nike");
  assert.equal(mcpQueryOf({ store: "Shein", limit: 5 }), "shein");
  assert.equal(mcpQueryOf({ category: "tecnologia" }), "tecnologia");
  assert.equal(mcpQueryOf({ id: 123 }), "#123");
  assert.equal(mcpQueryOf({}), "");
  assert.equal(mcpQueryOf(null), "");
  assert.equal(mcpQueryOf({ query: "x".repeat(300) }).length, 100);
});
