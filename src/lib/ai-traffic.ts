// Pure helpers for the AI part of Estadísticas (no DOM, no database), so they test on their own: which assistant a GA4
// session source is, and which AI bot or search crawler a user agent is.

// ---- visits sent by an assistant (GA4 sessionSource)

// GA4's session source for a visit: the referrer's host ("chatgpt.com", "perplexity.ai") or a utm_source. ChatGPT tags
// its links ?utm_source=chatgpt.com; our MCP tags its links with the source it counted the assistant under (claude,
// chatgpt, ia, see src/lib/mcp.ts).
const ASSISTANTS: [RegExp, string][] = [
  [/^(chatgpt(\.com)?|chat\.openai\.com|openai)$/, "ChatGPT"],
  [/^(www\.)?perplexity(\.ai)?$/, "Perplexity"],
  [/^(gemini\.google\.com|bard\.google\.com|gemini)$/, "Gemini"],
  [/^(claude(\.ai)?)$/, "Claude"],
  [/^(copilot\.microsoft\.com|copilot\.cloud\.microsoft|m365copilot\.com|copilot)$/, "Copilot"],
  [/^(chat\.deepseek\.com|deepseek)$/, "DeepSeek"],
  [/^(grok\.com|x\.ai|grok)$/, "Grok"],
  [/^(chat\.mistral\.ai|mistral)$/, "Mistral"],
  [/^(meta\.ai|www\.meta\.ai)$/, "Meta AI"],
  [/^(you\.com|phind\.com|ia)$/, "Otros"],
];

// "chatgpt.com" → "ChatGPT"; null when the source isn't an assistant ("google", "(direct)"…)
export function assistantOfSource(source: string): string | null {
  const s = source.trim().toLowerCase();
  for (const [re, name] of ASSISTANTS) if (re.test(s)) return name;
  return null;
}

// ---- bots that read the site

// live: someone asked the assistant just now and it opened the page to answer; search: builds the assistant's (or
// engine's) search index; training: collects pages to train models
export type BotKind = "live" | "search" | "training";
export const BOT_KIND_LABEL: Record<BotKind, string> = { live: "En directo", search: "Índice de búsqueda", training: "Entrenamiento" };

export interface AiBot { id: string; who: string; kind: BotKind }

// Matched on the user agent, first hit wins. bingbot and Googlebot aren't AI, but Bing's index is what ChatGPT and
// Copilot search, and Google's feeds Gemini and AI Overviews: they show beside the rest to compare.
const BOTS: [RegExp, AiBot][] = [
  [/chatgpt-user/i, { id: "ChatGPT-User", who: "OpenAI", kind: "live" }],
  [/oai-searchbot/i, { id: "OAI-SearchBot", who: "OpenAI", kind: "search" }],
  [/gptbot/i, { id: "GPTBot", who: "OpenAI", kind: "training" }],
  [/claude-user/i, { id: "Claude-User", who: "Anthropic", kind: "live" }],
  [/claude-searchbot/i, { id: "Claude-SearchBot", who: "Anthropic", kind: "search" }],
  [/claudebot/i, { id: "ClaudeBot", who: "Anthropic", kind: "training" }],
  [/perplexity-user/i, { id: "Perplexity-User", who: "Perplexity", kind: "live" }],
  [/perplexitybot/i, { id: "PerplexityBot", who: "Perplexity", kind: "search" }],
  [/mistralai-user/i, { id: "MistralAI-User", who: "Mistral", kind: "live" }],
  [/duckassistbot/i, { id: "DuckAssistBot", who: "DuckDuckGo", kind: "live" }],
  [/meta-externalfetcher/i, { id: "meta-externalfetcher", who: "Meta", kind: "live" }],
  [/meta-externalagent/i, { id: "meta-externalagent", who: "Meta", kind: "training" }],
  [/bytespider/i, { id: "Bytespider", who: "ByteDance", kind: "training" }],
  [/ccbot/i, { id: "CCBot", who: "Common Crawl", kind: "training" }],
  [/amazonbot/i, { id: "Amazonbot", who: "Amazon", kind: "search" }],
  [/applebot/i, { id: "Applebot", who: "Apple", kind: "search" }],
  [/bingbot/i, { id: "bingbot", who: "Microsoft", kind: "search" }],
  [/googlebot/i, { id: "Googlebot", who: "Google", kind: "search" }],
];

export function aiBotOf(ua: string | null | undefined): AiBot | null {
  if (!ua) return null;
  for (const [re, bot] of BOTS) if (re.test(ua)) return bot;
  return null;
}

export const botInfo = (id: string): AiBot => BOTS.find(([, b]) => b.id === id)?.[1] ?? { id, who: "", kind: "search" };

// The path a bot read, as stored: no query string (it can carry anything), at most 200 characters
export const botPath = (pathname: string): string => (pathname.split(/[?#]/)[0] || "/").slice(0, 200);

// ---- MCP calls

// What a tool call asked for, as stored: its search, else the store or category, else the coupon id; lowercase, at
// most 100 characters. Never the whole arguments object.
export function mcpQueryOf(args: unknown): string {
  const a = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
  const pick = [a.query, a.store, a.category].find((v) => typeof v === "string" && v.trim()) as string | undefined;
  if (pick) return pick.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 100);
  return typeof a.id === "number" || typeof a.id === "string" ? `#${String(a.id).slice(0, 20)}` : "";
}
