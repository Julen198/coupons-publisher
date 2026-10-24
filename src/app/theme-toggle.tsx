"use client";

import { useEffect, useSyncExternalStore } from "react";

type Theme = "system" | "light" | "dark";

const KEY = "theme";
const OPTIONS: { id: Theme; label: string }[] = [
  { id: "light", label: "Claro" },
  { id: "dark", label: "Oscuro" },
  { id: "system", label: "Sistema" },
];

// Runs inline in <head> before first paint so there's no light/dark flash
export const THEME_SCRIPT = `try{var t=localStorage.getItem('${KEY}');document.documentElement.classList.toggle('dark',t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches))}catch(e){}`;

const systemDark = () => matchMedia("(prefers-color-scheme: dark)").matches;

function apply(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark" || (theme === "system" && systemDark()));
}

function readStored(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

// localStorage as an external store: re-render on our own writes and on other tabs' changes
const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, readStored, () => "system" as Theme);

  // In "system" mode, follow OS changes live
  useEffect(() => {
    if (theme !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  function choose(t: Theme) {
    apply(t);
    try {
      if (t === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, t);
    } catch {
      // storage blocked (private mode): the choice still applies for this page view
    }
    listeners.forEach((cb) => cb());
  }

  // compact segmented control: icons only, the label is the tooltip and the accessible name
  return (
    <div role="group" aria-label="Tema" className="flex gap-0.5 rounded-lg bg-neutral-100 p-0.5 dark:bg-neutral-800">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={theme === o.id}
          aria-label={o.label}
          title={o.label}
          onClick={() => choose(o.id)}
          className={`flex size-8 items-center justify-center rounded-md ${
            theme === o.id
              ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-950 dark:text-neutral-100"
              : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
          }`}
        >
          <ThemeIcon theme={o.id} />
        </button>
      ))}
    </div>
  );
}

function ThemeIcon({ theme }: { theme: Theme }) {
  const common = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
  if (theme === "light")
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </svg>
    );
  if (theme === "dark") return <svg {...common}><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z" /></svg>;
  return (
    <svg {...common}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}
