"use client";

import { useEffect, useRef, useState } from "react";
import { clearFlash } from "./actions-reader";
import { CheckIcon } from "./entrar/icons";

const EVENT = "cl-toast";
const SHOW_MS = 2600;
const FLASH_SHOW_MS = 4000;

type Toast = { message: string; ok?: boolean; ms?: number };

// One short message at the bottom of the screen, as in the prototype. Anything on the page can raise it.
// `ok` adds the green check of the SiteEntrarVuelta board (step 4).
export function showToast(message: string, opts: { ok?: boolean; ms?: number } = {}) {
  window.dispatchEvent(new CustomEvent<Toast>(EVENT, { detail: { message, ...opts } }));
}

// Mounted once in the site layout; the status region stays in the page so screen readers announce each message
export function Toaster() {
  const [toast, setToast] = useState<Toast | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onToast = (e: Event) => {
      const t = (e as CustomEvent<Toast>).detail;
      setToast(t);
      clearTimeout(timer);
      timer = setTimeout(() => setToast(null), t.ms ?? SHOW_MS);
    };
    window.addEventListener(EVENT, onToast);
    return () => {
      window.removeEventListener(EVENT, onToast);
      clearTimeout(timer);
    };
  }, []);
  return (
    <div className="toast" role="status" hidden={!toast}>
      {toast?.ok && <span className="toast-ok"><CheckIcon /></span>}
      {toast?.message}
    </div>
  );
}

// The one-time "Ya has entrado como @x" flash: shown once, then the cookie is cleared on the server
export function FlashToast({ message }: { message: string }) {
  const shown = useRef(false);
  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    showToast(message, { ok: true, ms: FLASH_SHOW_MS });
    clearFlash().catch((e) => console.error("[flash] could not clear", e));
  }, [message]);
  return null;
}
