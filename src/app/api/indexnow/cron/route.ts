import { cronAuthorized } from "@/lib/telegram";
import { runIndexNowCron } from "@/lib/indexnow-cron";

// Hourly Vercel cron (vercel.json): ping IndexNow with the pages that are new, changed or gone. Auth first: no
// CRON_SECRET, no access.
export async function GET(req: Request) {
  if (!cronAuthorized(process.env.CRON_SECRET, req.headers.get("authorization"))) return new Response("Unauthorized", { status: 401 });
  try {
    return Response.json(await runIndexNowCron());
  } catch (e) {
    console.error("IndexNow cron failed", e);
    return Response.json({ error: "Falló el aviso a IndexNow" }, { status: 500 });
  }
}
