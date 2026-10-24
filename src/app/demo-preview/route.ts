import { canEdit, canSeeClient, getUser } from "@/lib/auth";
import { getClient } from "@/lib/db";
import { demoResponse, previewClient } from "@/lib/demo-response";

// Live preview of unsaved style fields. Without ?client: the "new client" form (admins, sample store).
// With ?client=<slug>: an existing client's real pages dressed with the values being edited.
export async function GET(req: Request) {
  const user = await getUser();
  if (!user || !canEdit(user)) return new Response("Sin permiso", { status: 403 });
  const params = new URL(req.url).searchParams;
  const slug = params.get("client");
  if (!slug) {
    if (user.role !== "admin") return new Response("Solo administradores", { status: 403 });
    return demoResponse(previewClient(params), req, { saved: false });
  }
  const base = await getClient(slug);
  if (!base || !canSeeClient(user, base.id)) return new Response("No encontrado", { status: 404 });
  const edited = previewClient(params);
  // only the look comes from the form; identity and affiliate data stay the saved ones
  return demoResponse(
    { ...base, name: edited.name, brand_color: edited.brand_color, logo_url: edited.logo_url, nav_items: edited.nav_items, font_style: edited.font_style, font_family: edited.font_family, layout: edited.layout },
    req,
    { saved: true },
  );
}
