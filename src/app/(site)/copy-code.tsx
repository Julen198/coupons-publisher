"use client";

import { useState } from "react";
import { copiedMessage } from "@/lib/site-text";
import { showToast } from "./toast";
import { trackEvent } from "./analytics";

// The toast and «Copiado» don't wait for the clipboard: a refused or slow copy (old browser, insecure origin) leaves the code visible and selectable.
// beacon = the coupon's /go address: a copy is counted there (kind copy) with navigator.sendBeacon, fire and forget, so
// copying never waits on it and a blocked beacon changes nothing.
function copyToClipboard(code: string, beacon?: string) {
  navigator.clipboard?.writeText(code).catch(() => {});
  showToast(copiedMessage(code));
  trackEvent("copy_code");
  if (beacon) {
    try {
      navigator.sendBeacon?.(beacon, window.location.pathname);
    } catch {
      // the count is best effort; the reader already has the code
    }
  }
}

// The code on a dashed ticket; one tap copies it and the button keeps saying «Copiado», as in the prototype
export function CopyCode({ code, beacon }: { code: string; beacon?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="code">
      <span>{code}</span>
      <button type="button" onClick={() => { copyToClipboard(code, beacon); setCopied(true); }} aria-label={`Copiar el código ${code}`}>
        {copied ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}

// The phone bar's version: a plain button that shows the code and copies it on tap
export function CopyCodeButton({ code, beacon }: { code: string; beacon?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button className="btn" type="button" onClick={() => { copyToClipboard(code, beacon); setCopied(true); }} aria-label={`Copiar el código ${code}`}>
      {copied ? "Copiado" : code}
    </button>
  );
}
