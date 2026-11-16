import { cronAuthorized } from "@/lib/telegram";
import { forgetAnonVoteIps, purgeOldClicks } from "@/lib/clicks";

// Daily Vercel cron (vercel.json): the only place clicks are deleted, older than the retention window (400 days unless
// Ajustes says to keep them all, see retentionDays), and where anonymous votes lose their IP hash. Auth first: no CRON_SECRET, no access.
export async function GET(req: Request) {
  if (!cronAuthorized(process.env.CRON_SECRET, req.headers.get("authorization"))) return new Response("Unauthorized", { status: 401 });
  try {
    const deleted = await purgeOldClicks();
    return Response.json({ deleted, anonVoteIpsForgotten: await forgetAnonVoteIps() });
  } catch (e) {
    console.error("click retention cron failed", e);
    return Response.json({ error: "Falló el borrado de clics antiguos" }, { status: 500 });
  }
}
