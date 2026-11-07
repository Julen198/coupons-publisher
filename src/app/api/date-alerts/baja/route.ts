import { verifyUnsubscribe } from "@/lib/date-alerts";
import { setDateAlert } from "@/lib/date-alert-subs";

// One-click unsubscribe from the "Avísame antes de cada fecha" email. The signed token (HMAC with SESSION_SECRET)
// is the only proof needed: GET for the link in the email, POST for mail clients' List-Unsubscribe-Post.
const page = (title: string, body: string, status: number) =>
  new Response(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title} · CuponLab</title></head>` +
      `<body style="font-family:system-ui,sans-serif;max-width:480px;margin:48px auto;padding:0 16px;color:#171717;background:#fff"><h1 style="font-size:22px">${title}</h1><p>${body}</p><p><a href="/calendario">Volver al calendario</a></p></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );

async function unsubscribe(req: Request): Promise<Response> {
  const readerId = verifyUnsubscribe(process.env.SESSION_SECRET, new URL(req.url).searchParams.get("t"));
  if (!readerId) return page("Enlace no válido", "Este enlace para darte de baja no es válido. Puedes quitar el aviso desde el calendario.", 400);
  try {
    await setDateAlert(readerId, false);
  } catch (e) {
    console.error("[date-alerts] unsubscribe failed", { readerId }, e);
    return page("No se pudo dar de baja", "Inténtalo de nuevo en unos minutos.", 500);
  }
  return page("Aviso quitado", "Ya no te enviaremos emails antes de cada fecha.", 200);
}

export const GET = unsubscribe;
export const POST = unsubscribe;
