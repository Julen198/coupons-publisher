"use client";

import { useState } from "react";

// The code on a dashed ticket; one tap copies it
export function CopyCode({ code, compact = false }: { code: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // clipboard refused (old browser, insecure origin): the code stays visible to copy by hand
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className={`flex items-stretch overflow-hidden rounded-md border-[1.5px] border-dashed border-blue-700 bg-blue-50 dark:border-blue-400 dark:bg-blue-950 ${compact ? "text-sm" : ""}`}>
      <span className="flex-1 select-all px-3 py-2 text-center font-mono font-bold tracking-wider text-blue-800 dark:text-blue-200">{code}</span>
      <button
        type="button"
        onClick={copy}
        className="border-l-[1.5px] border-dashed border-blue-700 px-3 text-xs font-bold text-blue-800 hover:bg-blue-100 dark:border-blue-400 dark:text-blue-200 dark:hover:bg-blue-900"
      >
        <span aria-live="polite">{copied ? "Copiado" : "Copiar"}</span>
      </button>
    </div>
  );
}
