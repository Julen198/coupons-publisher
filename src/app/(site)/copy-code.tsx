"use client";

import { useState } from "react";
import { copiedMessage } from "@/lib/site-text";
import { showToast } from "./toast";

// The toast and «Copiado» don't wait for the clipboard: a refused or slow copy (old browser, insecure origin) leaves the code visible and selectable
function copyToClipboard(code: string) {
  navigator.clipboard?.writeText(code).catch(() => {});
  showToast(copiedMessage(code));
}

// The code on a dashed ticket; one tap copies it and the button keeps saying «Copiado», as in the prototype
export function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="code">
      <span>{code}</span>
      <button type="button" onClick={() => { copyToClipboard(code); setCopied(true); }} aria-label={`Copiar el código ${code}`}>
        {copied ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}

// The phone bar's version: a plain button that shows the code and copies it on tap
export function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button className="btn" type="button" onClick={() => { copyToClipboard(code); setCopied(true); }} aria-label={`Copiar el código ${code}`}>
      {copied ? "Copiado" : code}
    </button>
  );
}
