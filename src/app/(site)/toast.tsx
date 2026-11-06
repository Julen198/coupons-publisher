"use client";

import { useEffect, useState } from "react";

const EVENT = "cl-toast";
const SHOW_MS = 2600;

// One short message at the bottom of the screen, as in the prototype. Anything on the page can raise it.
export function showToast(message: string) {
  window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: message }));
}

// Mounted once in the site layout; the status region stays in the page so screen readers announce each message
export function Toaster() {
  const [message, setMessage] = useState("");
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onToast = (e: Event) => {
      setMessage((e as CustomEvent<string>).detail);
      clearTimeout(timer);
      timer = setTimeout(() => setMessage(""), SHOW_MS);
    };
    window.addEventListener(EVENT, onToast);
    return () => {
      window.removeEventListener(EVENT, onToast);
      clearTimeout(timer);
    };
  }, []);
  return (
    <div className="toast" role="status" hidden={!message}>
      {message}
    </div>
  );
}
