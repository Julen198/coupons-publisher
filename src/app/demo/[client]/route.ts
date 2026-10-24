import { canSeeClient, getUser } from "@/lib/auth";
import { getClient } from "@/lib/db";
import { demoResponse } from "@/lib/demo-response";

export async function GET(req: Request, ctx: RouteContext<"/demo/[client]">) {
  const { client: slug } = await ctx.params;
  const [user, client] = await Promise.all([getUser(), getClient(slug)]);
  if (!client || !user || !canSeeClient(user, client.id)) return new Response("Cliente no encontrado", { status: 404 });
  return demoResponse(client, req, { saved: true });
}
