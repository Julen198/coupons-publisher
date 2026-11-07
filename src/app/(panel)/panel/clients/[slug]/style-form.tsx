"use client";

import { useEffect, useState, type ReactNode } from "react";
import { generateDisguise, updateDisguise } from "@/app/actions";
import { btnCls, btnSecondaryCls, cardCls, colorCls, Field, inputCls } from "@/app/ui";
import { LogoPreview } from "./logo-preview";

interface Style { name: string; logo: string; color: string; layout: string; ff: string; font: string; nav: string }

const PREVIEW_DEBOUNCE_MS = 400;

// "Estilo de la demo" with a live preview of the client's demo as you edit (nothing is saved until "Guardar estilo")
interface StyleFormProps { slug: string; domain: string; initial: Style; aside: ReactNode }

export function StyleForm({ slug, domain, initial, aside }: StyleFormProps) {
  const [s, setS] = useState(initial);
  const [src, setSrc] = useState("");
  const set = (k: keyof Style) => (e: { target: { value: string } }) => setS({ ...s, [k]: e.target.value });
  const dirty = JSON.stringify(s) !== JSON.stringify(initial);

  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams({ client: slug, embed: "1", name: s.name, logo: s.logo, color: s.color, layout: s.layout, ff: s.ff, font: s.font, nav: s.nav });
      setSrc(`/demo-preview?${p}`);
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [s, slug]);

  return (
    <div className="flex flex-wrap items-start gap-6">
      <div className="flex max-w-md min-w-0 flex-[1_1_320px] flex-col gap-6">
        {aside}
        <section className={`${cardCls} flex flex-col gap-4`}>
          <div className="flex flex-col gap-3">
            <div>
              <h2 className="font-semibold">Estilo de la demo</h2>
              <p className="text-sm text-neutral-500">Cómo se viste /demo/{slug} para parecer su web.</p>
            </div>
            <form action={generateDisguise}>
              <input type="hidden" name="slug" value={slug} />
              <button className={`${btnSecondaryCls} min-h-10 w-full`} disabled={!domain}>Generar desde {domain || "su web"}</button>
            </form>
          </div>
          <form action={updateDisguise} className="flex flex-col gap-3">
            <input type="hidden" name="slug" value={slug} />
            <Field label="Nombre" name="name" required value={s.name} onChange={set("name")} />
            <Field label="URL del logo" name="logo_url" type="url" value={s.logo} onChange={set("logo")} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Color de marca" name="brand_color" type="color" className={colorCls} value={s.color} onChange={set("color")} />
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-neutral-600 dark:text-neutral-400">Cabecera</span>
                <select name="layout" value={s.layout} onChange={set("layout")} className={inputCls}>
                  <option value="newspaper">Periódico</option>
                  <option value="store">Tienda online</option>
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tipografía de su web" name="font_family" value={s.ff} onChange={set("ff")} placeholder="Montserrat" />
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-neutral-600 dark:text-neutral-400">Si no carga</span>
                <select name="font_style" value={s.font} onChange={set("font")} className={inputCls}>
                  <option value="serif">Serif</option>
                  <option value="sans">Sans</option>
                </select>
              </label>
            </div>
            <Field label="Secciones del menú (separadas por comas)" name="nav_items" value={s.nav} onChange={set("nav")} placeholder="Portada, España, Deportes" />
            <div className="flex flex-wrap items-center gap-3">
              <button className={`${btnCls} disabled:cursor-not-allowed disabled:opacity-40`} disabled={!dirty}>Guardar estilo</button>
              {dirty && <button type="button" onClick={() => setS(initial)} className="text-sm text-neutral-600 underline dark:text-neutral-400">Deshacer cambios</button>}
              {s.logo && <LogoPreview key={s.logo} src={s.logo} name={s.name} />}
            </div>
          </form>
        </section>
      </div>

      <section aria-label="Vista previa del estilo" className="flex min-w-0 flex-[999_1_560px] flex-col overflow-hidden rounded-lg border border-neutral-200 bg-slate-100 md:sticky md:top-6 dark:border-neutral-800 dark:bg-neutral-900">
        <p className="flex items-center justify-between gap-3 border-b border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-600 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
          <span>Así se ve su demo{dirty ? " con tus cambios (sin guardar)" : ""}</span>
          <a href={`/demo/${slug}`} target="_blank" className="text-blue-700 hover:underline dark:text-blue-300">Abrir su demo ↗</a>
        </p>
        <div className="p-3">
          {src && <iframe title="Vista previa de la demo" src={src} className="h-[760px] w-full rounded bg-white shadow" />}
        </div>
      </section>
    </div>
  );
}
