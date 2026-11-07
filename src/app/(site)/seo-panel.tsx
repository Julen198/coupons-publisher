"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Development-only SEO/GEO inspector: a header toggle (class "annotate" on the .cl root outlines every data-seo element)
// and a drawer with notes per page type plus the JSON-LD the page really emits. The header renders both only outside production.
export const SEO_PANEL = process.env.NODE_ENV !== "production";

type PageKind = "home" | "deal" | "store" | "other";

const NOTES: Record<PageKind, { title: string; text: string }[]> = {
  home: [
    { title: "Respuesta citable arriba.", text: "Un párrafo con el número de cupones activos, las tiendas y la hora de actualización, que un buscador o una IA puede citar tal cual." },
    { title: "Schema.org en el HTML.", text: "WebSite, ItemList con Offer (descuento, vigencia, vendedor) y FAQPage. Las migas de pan de la portada son visuales, sin BreadcrumbList." },
    { title: "Enlazado interno.", text: "Tiendas con más cupones, guías por tienda y calendario de ofertas llevan a las páginas de tienda y de temporada." },
    { title: "Texto propio por tienda.", text: "Envío, devoluciones y reglas de códigos de cada tienda con guía." },
    { title: "Transparencia.", text: "Aviso de afiliación, cómo comprobamos cada cupón y autoría del equipo editorial con fecha de los datos." },
  ],
  deal: [
    { title: "H1 con producto y tienda.", text: "El título del chollo nombra el descuento y la tienda." },
    { title: "Veredicto citable.", text: "Un párrafo corto con descuento, código, vigencia y condiciones." },
    { title: "Texto propio del chollo.", text: "«Sobre este chollo»: dos párrafos originales redactados con IA a partir de los datos del cupón y revisados por un editor. Solo aparece cuando está aprobado y abre la meta description." },
    { title: "Schema.org.", text: "Offer y BreadcrumbList; FAQPage cuando la tienda tiene preguntas frecuentes. Los pasos de uso son HTML, sin HowTo." },
    { title: "Condiciones claras.", text: "Lista de descuento, validez, estado, condiciones y tienda." },
    { title: "Caducados con su URL.", text: "Un cupón caducado no da 404: sigue en su dirección, marcado como caducado, con enlaces a cupones activos de la tienda." },
    { title: "Comunidad y enlazado.", text: "Comentarios, chollos parecidos y enlace a la tienda. Aviso de afiliación junto al botón." },
  ],
  store: [
    { title: "Respuesta citable.", text: "Cuántos cupones hay hoy, cuántos con código, cuántos comprobados y el mayor porcentaje." },
    { title: "Schema.org.", text: "BreadcrumbList, ItemList con Offer y FAQPage cuando la tienda tiene preguntas." },
    { title: "Texto único por tienda.", text: "Envío, devoluciones y reglas de códigos propios de la tienda, lo que diferencia la página de un listado copiado." },
    { title: "Enlazado interno.", text: "Otras tiendas con cupones y el índice de tiendas." },
  ],
  other: [
    { title: "Migas de pan.", text: "Visuales y en BreadcrumbList." },
    { title: "Índices y calendario.", text: "El listado de tiendas emite ItemList; el calendario emite FAQPage y una respuesta con la próxima fecha." },
    { title: "Transparencia.", text: "Metodología, aviso de afiliación y contacto sostienen la confianza (E-E-A-T)." },
  ],
};

function kindOf(path: string): PageKind {
  if (path === "/") return "home";
  if (path.startsWith("/chollos/")) return "deal";
  if (path.startsWith("/tiendas/")) return "store";
  return "other";
}

type LdBlock = { label: string; json: string };

function readLd(): LdBlock[] {
  return [...document.querySelectorAll('script[type="application/ld+json"]')].map((el, i) => {
    const raw = el.textContent ?? "";
    try {
      const data: unknown = JSON.parse(raw);
      const t = (data as { "@type"?: string | string[] })["@type"];
      return { label: Array.isArray(t) ? t.join(" + ") : (t ?? `Bloque ${i + 1}`), json: JSON.stringify(data, null, 2) };
    } catch {
      return { label: `Bloque ${i + 1} (inválido)`, json: raw };
    }
  });
}

export function SeoToggle() {
  const [on, setOn] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.closest(".cl")?.classList.toggle("annotate", on);
  }, [on]);
  if (!SEO_PANEL) return null;
  return (
    <button ref={ref} className="btn btn-seo" type="button" aria-pressed={on} onClick={() => setOn((v) => !v)}>
      Ver SEO/GEO
    </button>
  );
}

export function SeoDrawer() {
  const path = usePathname();
  const sp = useSearchParams().toString();
  const rootRef = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const [blocks, setBlocks] = useState<LdBlock[]>([]);
  const [tab, setTab] = useState(0);

  // follow the toggle through the class on the .cl root
  useEffect(() => {
    const root = rootRef.current?.closest(".cl");
    if (!root) return;
    const sync = () => setOpen(root.classList.contains("annotate"));
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);

  // re-read the page's JSON-LD on every navigation (after the new page has committed)
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      const found = readLd();
      setBlocks(found);
      // open on the feed's ItemList when the page has one, as the prototype does
      setTab(Math.max(0, found.findIndex((b) => b.label === "ItemList")));
    }, 150);
    return () => window.clearTimeout(id);
  }, [open, path, sp]);

  if (!SEO_PANEL) return null;
  const notes = NOTES[kindOf(path)];
  const current = blocks[Math.min(tab, blocks.length - 1)];
  return (
    <section ref={rootRef} className="seo-drawer" hidden={!open} aria-label="Notas SEO y GEO">
      <div className="wrap">
        <div>
          <h2>Qué hace esta página por el SEO y el GEO</h2>
          <ul className="seo-list">
            {notes.map((n) => (
              <li key={n.title}>
                <b>{n.title}</b> {n.text}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2>JSON-LD incluido en la página</h2>
          {blocks.length === 0 ? (
            <p className="small">Esta página no emite JSON-LD.</p>
          ) : (
            <>
              <div className="ld-tabs" role="tablist">
                {blocks.map((b, i) => (
                  <button key={i} role="tab" type="button" aria-selected={i === tab} onClick={() => setTab(i)}>
                    {b.label}
                  </button>
                ))}
              </div>
              <pre className="ld">{current?.json}</pre>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
