import { sql } from "@/lib/db";

// A store's embedded icon as a real image, so lists link to it (cached by the browser) instead of inlining it
export async function GET(_req: Request, ctx: RouteContext<"/store-logo/[slug]">) {
  const { slug } = await ctx.params;
  const [row] = await sql()<{ logo_data: string }[]>`SELECT logo_data FROM stores WHERE slug = ${slug}`;
  const m = row?.logo_data.match(/^data:(image\/[\w.+-]+);base64,(.+)$/);
  if (!m) return new Response("Sin logo", { status: 404 });
  return new Response(Buffer.from(m[2], "base64"), {
    headers: {
      "Content-Type": m[1],
      "Cache-Control": "private, max-age=86400",
      // SVG opened directly must not run scripts
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
