"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { logout } from "@/app/actions";
import { ThemeToggle } from "@/app/theme-toggle";

interface AccountMenuProps {
  name: string;
  email: string;
  role: string;
  roleKey: "admin" | "editor" | "viewer";
  description: string;
  isAdmin: boolean;
}

const initials = (name: string) =>
  name.split(/[\s._@-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

function Avatar({ name, size }: { name: string; size: "sm" | "lg" }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-neutral-200 font-semibold text-neutral-700 dark:bg-neutral-700 dark:text-neutral-100 ${size === "lg" ? "size-10 text-sm" : "size-7 text-[11px]"}`}
    >
      {initials(name)}
    </span>
  );
}

const iconProps = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

// Sidebar footer: who you are + theme + admin + logout, in one popover
const ROLE_BADGE = {
  admin: "border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200",
  editor: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200",
  viewer: "border-neutral-300 bg-neutral-100 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
};

export function AccountMenu({ name, email, role, roleKey, description, isAdmin }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // close on outside click / Escape, returning focus to the trigger on Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Cuenta"
          className="absolute bottom-full left-0 z-30 mb-2 w-72 overflow-hidden rounded-xl border border-neutral-200 bg-white text-sm shadow-xl dark:border-neutral-800 dark:bg-neutral-900"
        >
          <div className="flex flex-col gap-2 p-4">
            <div className="flex items-center gap-3">
              <Avatar name={name} size="lg" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-2">
                  <span className="truncate font-semibold">{name}</span>
                  <span className={`shrink-0 rounded-full border px-1.5 py-px text-[11px] font-medium ${ROLE_BADGE[roleKey]}`}>{role}</span>
                </span>
                <span className="truncate text-xs text-neutral-500 dark:text-neutral-400">{email}</span>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">{description}</p>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-neutral-200 px-4 py-2.5 dark:border-neutral-800">
            <span className="text-neutral-600 dark:text-neutral-400">Tema</span>
            <ThemeToggle />
          </div>

          {isAdmin && (<Link
            href="/panel/settings"
            onClick={() => setOpen(false)}
            className="flex min-h-10 items-center gap-2.5 border-t border-neutral-200 px-4 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/60"
          >
            <svg {...iconProps}>
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Administración
          </Link>)}

          <form action={logout} className="border-t border-neutral-200 dark:border-neutral-800">
            <button className="flex min-h-10 w-full items-center gap-2.5 px-4 text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40">
              <svg {...iconProps}>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
              Cerrar sesión
            </button>
          </form>
        </div>
      )}

      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-neutral-200/60 aria-expanded:bg-neutral-200/60 dark:hover:bg-neutral-800 dark:aria-expanded:bg-neutral-800"
      >
        <Avatar name={name} size="sm" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px] leading-tight font-medium">{name}</span>
          <span className="truncate text-[11px] leading-tight text-neutral-500 dark:text-neutral-400">{role}</span>
        </span>
        <svg {...iconProps} width={14} height={14} className="shrink-0 text-neutral-400 dark:text-neutral-500">
          <path d="M7 15l5 5 5-5M7 9l5-5 5 5" />
        </svg>
      </button>
    </div>
  );
}
