"use client";

import { useRef, useState, type ComponentProps } from "react";
import { inputCls } from "@/app/ui";

interface SearchInputProps extends Omit<ComponentProps<"input">, "type"> {
  submitOnClear?: boolean; // filter forms: clearing the text re-runs the filter
}

// Text input with a ✕ that empties it (the native search ✕ only exists in WebKit and looks different everywhere)
export function SearchInput({ submitOnClear = false, defaultValue, className = "", ...props }: SearchInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  const [hasText, setHasText] = useState(Boolean(defaultValue));

  function clear() {
    const input = ref.current;
    if (!input) return;
    input.value = "";
    setHasText(false);
    input.focus();
    if (submitOnClear) input.form?.requestSubmit();
  }

  return (
    <span className="relative flex w-full items-center">
      <input
        ref={ref}
        type="search"
        defaultValue={defaultValue}
        onInput={(e) => setHasText(Boolean(e.currentTarget.value))}
        className={`${inputCls} pr-9 [&::-webkit-search-cancel-button]:appearance-none ${className}`}
        {...props}
      />
      {hasText && (
        <button
          type="button"
          onClick={clear}
          aria-label="Borrar el texto"
          className="absolute right-1.5 flex size-7 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      )}
    </span>
  );
}
