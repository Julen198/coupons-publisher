import { randomUUID } from "node:crypto";
import { aiSourceOf, handleRpc, sessionIdFor, sourceOfSession, type RpcReply } from "@/lib/mcp";
import { mcpData } from "@/lib/mcp-data";

// The CuponLab MCP server for Claude, ChatGPT and other assistants (see src/lib/mcp.ts). Public and read-only: it
// answers with the coupons the public site already shows, so it needs no sign-in.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { ...CORS, "Cache-Control": "no-store", ...headers } });

export async function POST(req: Request) {
  let msg: unknown;
  try {
    msg = await req.json();
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }
  const ua = req.headers.get("user-agent");
  const initialize = !!msg && typeof msg === "object" && (msg as { method?: unknown }).method === "initialize";
  const clientName = initialize ? String(((msg as { params?: { clientInfo?: { name?: unknown } } }).params?.clientInfo?.name) ?? "") : "";
  // which assistant: told by the session id we gave it at initialize, else guessed from its user agent
  const source = sourceOfSession(req.headers.get("mcp-session-id")) || aiSourceOf(clientName, ua);
  try {
    const data = mcpData();
    // an old client may still send a batch: answer each message
    const replies = Array.isArray(msg)
      ? (await Promise.all(msg.map((m) => handleRpc(m, data, source)))).filter((r): r is RpcReply => r !== null)
      : await handleRpc(msg, data, source);
    if (replies === null || (Array.isArray(replies) && !replies.length)) return new Response(null, { status: 202, headers: CORS });
    return json(replies, 200, initialize ? { "Mcp-Session-Id": sessionIdFor(source, randomUUID()) } : {});
  } catch (e) {
    console.error("[mcp] request failed", e);
    const id = !Array.isArray(msg) && msg && typeof msg === "object" ? ((msg as { id?: unknown }).id ?? null) : null;
    return json({ jsonrpc: "2.0", id, error: { code: -32603, message: "Internal error" } }, 500);
  }
}

// No server-to-client stream: everything comes back in the POST's answer
export function GET() {
  return new Response("Método no permitido", { status: 405, headers: { ...CORS, Allow: "POST, OPTIONS" } });
}

// Nothing kept per session, so ending one has nothing to clean
export function DELETE() {
  return new Response(null, { status: 204, headers: CORS });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
