import { cronAuthorized } from "@/lib/telegram";
import { runGuidesCron } from "@/lib/guides-cron";

// Writing a guide is a long AI call (two tries per store, a few stores a day)
export const maxDuration = 300;

// Daily Vercel cron (vercel.json): publish due guides, write today's, tell the admin chat
export async function GET(req: Request) {
  if (!cronAuthorized(process.env.CRON_SECRET, req.headers.get("authorization"))) return new Response("Unauthorized", { status: 401 });
  try {
    return Response.json(await runGuidesCron());
  } catch (e) {
    console.error("guides cron failed", e);
    return Response.json({ error: "Falló el cron de guías" }, { status: 500 });
  }
}
