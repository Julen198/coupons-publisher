"use client";

import { useState, type ComponentProps } from "react";

export const authInputCls =
  "min-h-12 w-full rounded-lg border border-neutral-300 bg-white px-3.5 text-[15px] focus:border-blue-700 focus:ring-3 focus:ring-blue-700/25 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:focus:border-blue-400 dark:focus:ring-blue-400/30";

// Password field with a "Mostrar/Ocultar" toggle inside it
export function PasswordInput(props: Omit<ComponentProps<"input">, "type">) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative flex">
      <input {...props} type={show ? "text" : "password"} className={`${authInputCls} pr-24`} />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? "Ocultar la contraseña" : "Mostrar la contraseña"}
        aria-pressed={show}
        className="absolute inset-y-1.5 right-1.5 rounded-md bg-neutral-100 px-3 text-xs font-medium text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
      >
        {show ? "Ocultar" : "Mostrar"}
      </button>
    </span>
  );
}

export function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 motion-safe:animate-spin" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity=".3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
