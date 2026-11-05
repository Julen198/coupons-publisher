"use client";

import { useState } from "react";

// The code on a dashed ticket; one tap copies it
export function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // clipboard refused (old browser, insecure origin): the code stays visible and selectable
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="code">
      <span>{code}</span>
      <button type="button" onClick={copy}>
        <span aria-live="polite">{copied ? "Copiado" : "Copiar"}</span>
      </button>
    </div>
  );
}
