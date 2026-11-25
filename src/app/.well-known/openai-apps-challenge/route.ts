// OpenAI's domain check for the ChatGPT plugin (see docs/mcp.md): the portal shows a token, which goes in the
// OPENAI_APPS_CHALLENGE environment variable, and this answers it as plain text. Nothing set = 404.
export function GET() {
  const token = process.env.OPENAI_APPS_CHALLENGE?.trim();
  if (!token) return new Response("No encontrado", { status: 404 });
  return new Response(token, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
