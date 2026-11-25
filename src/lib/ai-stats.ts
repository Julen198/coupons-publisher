// The database side of the AI part of Estadísticas: AI bots reading the site (ai_bot_hits, written by src/proxy.ts) and
// tool calls to the MCP server (mcp_calls, written by /mcp). Until the migration creates the tables (SCHEMA_SQL, npm run
// db:setup) nothing is written and the panel shows the section as not set up.
import { sql } from "./db";
import { columnGuard } from "./tracking-columns.ts";
import { botInfo, type BotKind } from "./ai-traffic.ts";

export const botHitsTable = columnGuard(/\bai_bot_hits\b/);
export const mcpCallsTable = columnGuard(/\bmcp_calls\b/);
export const AI_RETENTION_DAYS = 400;

export async function recordBotHit(bot: string, path: string): Promise<void> {
  await botHitsTable.run(async (present) => {
    if (!present) return;
    await sql()`
      INSERT INTO ai_bot_hits (day, bot, path, hits) VALUES ((now() AT TIME ZONE 'Europe/Madrid')::date, ${bot}, ${path}, 1)
      ON CONFLICT (day, bot, path) DO UPDATE SET hits = ai_bot_hits.hits + 1`;
  });
}

export async function recordMcpCall(source: string, tool: string, query: string): Promise<void> {
  await mcpCallsTable.run(async (present) => {
    if (!present) return;
    await sql()`INSERT INTO mcp_calls (source, tool, query) VALUES (${source}, ${tool.slice(0, 40)}, ${query})`;
  });
}

// The click retention cron: both tables keep 400 days, like clicks
export async function purgeOldAiStats(): Promise<number> {
  const bots = await botHitsTable.run(async (p) => (p ? (await sql()`DELETE FROM ai_bot_hits WHERE day < current_date - ${AI_RETENTION_DAYS}::int`).count : 0));
  const calls = await mcpCallsTable.run(async (p) => (p ? (await sql()`DELETE FROM mcp_calls WHERE at < now() - ${AI_RETENTION_DAYS} * interval '1 day'`).count : 0));
  return bots + calls;
}

export interface BotStat { bot: string; who: string; kind: BotKind; hits: number; prev: number; top: string }
export interface BotStats { ready: boolean; bots: BotStat[]; liveDaily: Map<string, number>; live: number; prevLive: number }

export async function botStats(start: string, end: string, prevStart: string, prevEnd: string): Promise<BotStats> {
  return botHitsTable.run(async (present) => {
    if (!present) return { ready: false, bots: [], liveDaily: new Map(), live: 0, prevLive: 0 };
    const [cur, prev, top, daily] = await Promise.all([
      sql()<{ bot: string; n: number }[]>`SELECT bot, sum(hits)::int AS n FROM ai_bot_hits WHERE day BETWEEN ${start}::date AND ${end}::date GROUP BY bot`,
      sql()<{ bot: string; n: number }[]>`SELECT bot, sum(hits)::int AS n FROM ai_bot_hits WHERE day BETWEEN ${prevStart}::date AND ${prevEnd}::date GROUP BY bot`,
      sql()<{ bot: string; path: string }[]>`
        SELECT DISTINCT ON (bot) bot, path FROM (
          SELECT bot, path, sum(hits) AS n FROM ai_bot_hits WHERE day BETWEEN ${start}::date AND ${end}::date GROUP BY bot, path
        ) t ORDER BY bot, n DESC`,
      sql()<{ day: string; bot: string; n: number }[]>`
        SELECT to_char(day, 'YYYY-MM-DD') AS day, bot, sum(hits)::int AS n FROM ai_bot_hits
        WHERE day BETWEEN ${start}::date AND ${end}::date GROUP BY 1, 2`,
    ]);
    const prevBy = new Map(prev.map((r) => [r.bot, r.n]));
    const topBy = new Map(top.map((r) => [r.bot, r.path]));
    const isLive = (bot: string) => botInfo(bot).kind === "live";
    const liveDaily = new Map<string, number>();
    for (const r of daily) if (isLive(r.bot)) liveDaily.set(r.day, (liveDaily.get(r.day) ?? 0) + r.n);
    const bots = cur.map((r) => {
      const info = botInfo(r.bot);
      return { bot: r.bot, who: info.who, kind: info.kind, hits: r.n, prev: prevBy.get(r.bot) ?? 0, top: topBy.get(r.bot) ?? "" };
    }).sort((a, b) => b.hits - a.hits);
    const sumLive = (rows: { bot: string; n: number }[]) => rows.filter((r) => isLive(r.bot)).reduce((n, r) => n + r.n, 0);
    return { ready: true, bots, liveDaily, live: sumLive(cur), prevLive: sumLive(prev) };
  });
}

export interface McpStats { ready: boolean; calls: number; prevCalls: number; top: { query: string; source: string; n: number }[] }

export async function mcpStats(start: string, end: string, prevStart: string, prevEnd: string): Promise<McpStats> {
  return mcpCallsTable.run(async (present) => {
    if (!present) return { ready: false, calls: 0, prevCalls: 0, top: [] };
    const [[cur], [prev], top] = await Promise.all([
      sql()<{ n: number }[]>`SELECT count(*)::int AS n FROM mcp_calls WHERE (at AT TIME ZONE 'Europe/Madrid')::date BETWEEN ${start}::date AND ${end}::date`,
      sql()<{ n: number }[]>`SELECT count(*)::int AS n FROM mcp_calls WHERE (at AT TIME ZONE 'Europe/Madrid')::date BETWEEN ${prevStart}::date AND ${prevEnd}::date`,
      // each search with the assistant that asked it most
      sql()<{ query: string; source: string; n: number }[]>`
        SELECT query, (array_agg(source ORDER BY source_n DESC))[1] AS source, sum(source_n)::int AS n FROM (
          SELECT CASE WHEN query = '' THEN tool ELSE query END AS query, source, count(*) AS source_n FROM mcp_calls
          WHERE (at AT TIME ZONE 'Europe/Madrid')::date BETWEEN ${start}::date AND ${end}::date GROUP BY 1, 2
        ) t GROUP BY query ORDER BY n DESC LIMIT 10`,
    ]);
    return { ready: true, calls: cur?.n ?? 0, prevCalls: prev?.n ?? 0, top };
  });
}
