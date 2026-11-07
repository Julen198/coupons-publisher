"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { createClient, previewDisguise, type FormState } from "@/app/actions";
import { btnCls, cardCls, colorCls, Field, inputCls } from "@/app/ui";

type Phase = "idle" | "loading" | "ready";

const EMPTY = { domain: "", awin: "", ref: "", name: "", color: "#1d4ed8", font: "serif", ff: "", layout: "newspaper", nav: "", logo: "" };
const PREVIEW_DEBOUNCE_MS = 400;

export function NewClientForm() {
  const [form, setForm] = useState(EMPTY);
  const [phase, setPhase] = useState<Phase>("idle");
  const [genError, setGenError] = useState("");
  const [guessed, setGuessed] = useState(false);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [previewSrc, setPreviewSrc] = useState("");
  const [, startGenerate] = useTransition();
  const [state, formAction, saving] = useActionState<FormState, FormData>(createClient, {});

  const set = (key: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });
  const ready = phase === "ready";

  // Rebuild the preview URL a moment after the user stops typing, so the iframe doesn't reload per keystroke
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      const p = new URLSearchParams({ name: form.name, color: form.color, font: form.font, ff: form.ff, layout: form.layout, nav: form.nav, logo: form.logo, domain: form.domain, awin: form.awin, ref: form.ref });
      setPreviewSrc(`/demo-preview?${p}`);
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [form, ready]);

  function generate() {
    setPhase("loading");
    setGenError("");
    setGuessed(false);
    startGenerate(async () => {
      const { disguise, error } = await previewDisguise(form.domain);
      if (error || !disguise) {
        setGenError(`${error ?? "No se pudo leer su web"}. Puedes configurarlo a mano.`);
        setPhase("idle");
        return;
      }
      setForm((f) => ({
        ...f,
        name: disguise.name ?? f.name,
        color: disguise.color ?? f.color,
        logo: disguise.logoUrl ?? f.logo,
        nav: disguise.nav?.join(", ") ?? f.nav,
        font: disguise.font ?? f.font,
        ff: disguise.fontFamily ?? f.ff,
        layout: disguise.layout ?? f.layout,
      }));
      setGuessed(!!disguise.guessed);
      setPhase("ready");
    });
  }

  const step = ready ? 3 : form.domain.trim() ? 2 : 1;
  const steps = ["Datos", "Estilo y vista previa", "Crear"];

  return (
    <div className="flex flex-col gap-6">
      <ol aria-label="Pasos" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {steps.map((label, i) => {
          const n = i + 1;
          const done = n < step;
          return (
            <li key={label} aria-current={n === step ? "step" : undefined} className={`flex items-center gap-2 ${n === step ? "font-semibold" : "text-neutral-500"}`}>
              <span className={`flex size-6 items-center justify-center rounded-full text-xs font-bold ${done ? "bg-green-700 text-white" : n === step ? "bg-blue-700 text-white" : "bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200"}`}>
                {done ? "✓" : n}
              </span>
              {label}
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-start gap-6">
        <form action={formAction} className="flex max-w-md min-w-0 flex-1 basis-80 flex-col gap-5">
          <fieldset className={`${cardCls} flex flex-col gap-3`}>
            <legend className="px-1 text-sm font-semibold text-neutral-600">1 · Datos del medio</legend>
            <Field label="Dominio" name="domain" required placeholder="www.diariox.es" value={form.domain} onChange={set("domain")} />
            <button type="button" onClick={generate} disabled={!form.domain.trim() || phase === "loading"} className="min-h-11 rounded-md border border-blue-700 bg-blue-50 text-sm font-semibold text-blue-900 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:bg-neutral-100 disabled:text-neutral-500 dark:border-blue-400 dark:bg-blue-950 dark:text-blue-100 dark:disabled:border-neutral-700 dark:disabled:bg-neutral-800 dark:disabled:text-neutral-400">
              {phase === "loading" ? "Leyendo portada…" : ready ? "Volver a generar" : "Generar desde su web"}
            </button>
            {!ready && (
              <button type="button" onClick={() => setPhase("ready")} className="text-sm text-blue-700 underline dark:text-blue-300">
                o configurarlo a mano
              </button>
            )}
            {genError && <p role="alert" className="text-sm text-red-800 dark:text-red-300">{genError}</p>}
            {guessed && (
              <p role="status" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                Su web bloquea la lectura automática. El estilo sale de lo que la IA conoce de la marca: revísalo y pega la URL del logo.
              </p>
            )}
          </fieldset>

          {ready && (
            <fieldset className={`${cardCls} flex flex-col gap-3`}>
              <legend className="px-1 text-sm font-semibold text-neutral-600">2 · Estilo de su web · retoca si hace falta</legend>
              <Field label="Nombre" name="name" required value={form.name} onChange={set("name")} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Color de marca" name="brand_color" type="color" className={colorCls} value={form.color} onChange={set("color")} />
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-neutral-600 dark:text-neutral-400">Cabecera</span>
                  <select name="layout" value={form.layout} onChange={set("layout")} className={inputCls}>
                    <option value="newspaper">Periódico</option>
                    <option value="store">Tienda online</option>
                  </select>
                </label>
                <Field label="Tipografía de su web" name="font_family" placeholder="Montserrat" value={form.ff} onChange={set("ff")} />
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-neutral-600 dark:text-neutral-400">Si no carga, parecida a</span>
                  <select name="font_style" value={form.font} onChange={set("font")} className={inputCls}>
                    <option value="serif">Serif (periódico)</option>
                    <option value="sans">Sans (digital)</option>
                  </select>
                </label>
              </div>
              <Field label="URL del logo" name="logo_url" type="url" placeholder="https://…/logo.svg" value={form.logo} onChange={set("logo")} />
              <Field label="Secciones del menú" name="nav_items" placeholder="Portada, España, Deportes" value={form.nav} onChange={set("nav")} />
            </fieldset>
          )}

          {state.error && <p role="alert" className="text-sm text-red-800 dark:text-red-300">{state.error}</p>}
          <button disabled={!ready || saving} className={`${btnCls} min-h-12 disabled:cursor-not-allowed disabled:opacity-40`}>
            {saving ? "Creando…" : "3 · Crear cliente"}
          </button>
        </form>

        <section aria-label="Vista previa de la demo" className="flex min-w-0 flex-[999_1_560px] flex-col overflow-hidden rounded-lg border border-neutral-200 bg-slate-100 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex flex-wrap items-center gap-3 border-b border-neutral-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-950">
            <span className="min-w-0 flex-1 truncate rounded bg-neutral-100 px-2 py-1 font-mono text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              {form.domain ? `Así quedaría en ${form.domain}` : "/demo/…"}
            </span>
            <div role="group" aria-label="Dispositivo" className="flex gap-1">
              {(["desktop", "mobile"] as const).map((d) => (
                <button key={d} type="button" aria-pressed={device === d} onClick={() => setDevice(d)} className={`min-h-9 rounded px-3 text-sm ${device === d ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "border border-neutral-300 dark:border-neutral-700"}`}>
                  {d === "desktop" ? "Escritorio" : "Móvil"}
                </button>
              ))}
            </div>
          </div>

          {phase === "idle" && (
            <div className="flex min-h-[640px] flex-col items-center justify-center gap-2 p-10 text-center text-neutral-600 dark:text-neutral-400">
              <strong className="text-base text-neutral-900 dark:text-neutral-100">La vista previa aparece al leer su web</strong>
              <span className="max-w-sm text-sm">Escribe el dominio del medio y pulsa «Generar desde su web». Verás su página con el módulo de cupones incrustado.</span>
            </div>
          )}
          {phase === "loading" && (
            <div className="flex min-h-[640px] flex-col gap-4 p-6" aria-busy="true">
              <span className="text-sm text-neutral-600 dark:text-neutral-400">Leyendo portada de {form.domain}…</span>
              <div className="h-14 animate-pulse rounded bg-slate-200 dark:bg-neutral-800" />
              <div className="mx-auto h-5 w-2/3 animate-pulse rounded bg-slate-200 dark:bg-neutral-800" />
              <div className="flex gap-4"><div className="h-96 flex-[3] animate-pulse rounded bg-slate-200 dark:bg-neutral-800" /><div className="h-64 flex-1 animate-pulse rounded bg-slate-200 dark:bg-neutral-800" /></div>
            </div>
          )}
          {ready && previewSrc && (
            <div className="flex justify-center p-4">
              <iframe title="Vista previa de la demo" src={previewSrc} className="h-[900px] rounded bg-white shadow" style={{ width: device === "mobile" ? 390 : "100%" }} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
