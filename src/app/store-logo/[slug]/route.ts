import { sql } from "@/lib/db";
import { isMissingSchema } from "@/lib/schema-guard";

const DATA_URI = /^data:(image\/[\w.+-]+);base64,(.+)$/;

// The stored image of one store: its square icon (logo_data), or with ?v=wordmark its wordmark (wordmark_data, the
// logo with its name). "" while the wordmark column doesn't exist yet (before npm run db:setup).
async function storedImage(slug: string, wordmark: boolean): Promise<string> {
  try {
    const [row] = wordmark
      ? await sql()<{ data: string }[]>`SELECT wordmark_data AS data FROM stores WHERE slug = ${slug}`
      : await sql()<{ data: string }[]>`SELECT logo_data AS data FROM stores WHERE slug = ${slug}`;
    return row?.data ?? "";
  } catch (e) {
    if (wordmark && isMissingSchema(e)) return "";
    throw e;
  }
}

// A store's embedded icon or wordmark (public: shown on the coupon pages publishers embed) as a real image, so lists
// link to it (cached by the browser) instead of inlining it
export async function GET(req: Request, ctx: RouteContext<"/store-logo/[slug]">) {
  const { slug } = await ctx.params;
  const wordmark = new URL(req.url).searchParams.get("v") === "wordmark";
  const m = (await storedImage(slug, wordmark)).match(DATA_URI);
  if (!m) return new Response(wordmark ? "Sin wordmark" : "Sin logo", { status: 404 });
  return new Response(Buffer.from(m[2], "base64"), {
    headers: {
      "Content-Type": m[1],
      "Cache-Control": "public, max-age=86400",
      // SVG opened directly must not run scripts
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
