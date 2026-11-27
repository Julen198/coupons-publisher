import { cronAuthorized } from "@/lib/telegram";
import { runCampaignsCron } from "@/lib/campaigns-cron";

// Writing the texts is a series of long AI calls; the run stops starting new ones at 200 s
export const maxDuration = 300;

// Vercel cron (vercel.json), twice a day: campaign pages per store and date, new events, before/after reports
export async function GET(req: Request) {
  if (!cronAuthorized(process.env.CRON_SECRET, req.headers.get("authorization"))) return new Response("Unauthorized", { status: 401 });
  try {
    return Response.json(await runCampaignsCron());
  } catch (e) {
    console.error("campaigns cron failed", e);
    return Response.json({ error: "Falló el cron de campañas" }, { status: 500 });
  }
}
