import { getClient, getStore } from "@/lib/db";
import { publicPageHtml } from "@/lib/public-page";

export async function GET(req: Request, ctx: RouteContext<"/p/[client]/[store]">) {
  const { client: clientSlug, store: storeSlug } = await ctx.params;
  const [client, store] = await Promise.all([getClient(clientSlug), getStore(storeSlug)]);
  if (!client || !store) return new Response("No encontrado", { status: 404 });

  const html = await publicPageHtml(client, store, new URL(req.url).origin);
  const headers: Record<string, string> = { "Content-Type": "text/html; charset=utf-8" };
  if (new URL(req.url).searchParams.has("download")) {
    headers["Content-Disposition"] = `attachment; filename="${client.slug}-${store.slug}.html"`;
  }
  return new Response(html, { headers });
}
