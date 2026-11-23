import { cronAuthorized } from "@/lib/telegram";
import { runStoreFactsCron } from "@/lib/store-facts-cron";

// A few dozen help pages, four at a time, up to 15 s each
export const maxDuration = 300;

// Daily Vercel cron (vercel.json): re-read the pages each store fact was copied from, tell the admin chat what changed
export async function GET(req: Request) {
  if (!cronAuthorized(process.env.CRON_SECRET, req.headers.get("authorization"))) return new Response("Unauthorized", { status: 401 });
  try {
    return Response.json(await runStoreFactsCron());
  } catch (e) {
    console.error("store facts cron failed", e);
    return Response.json({ error: "Falló la revisión de datos de tienda" }, { status: 500 });
  }
}
