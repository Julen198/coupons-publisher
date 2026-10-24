"use client";

import * as Popover from "@radix-ui/react-popover";
import { Command } from "cmdk";
import { useId, useRef, useState } from "react";

// shadcn-style Combobox (Popover + Command) for long lists like 100+ stores. cmdk handles filtering,
// keyboard navigation and listbox semantics; a hidden input carries the value so it works in any <form>.

export interface ComboOption {
  value: string;
  label: string;
  hint?: string; // secondary text on the right, e.g. "6 cupones"
}

interface ComboboxProps {
  name: string;
  options: ComboOption[];
  placeholder: string;
  defaultValue?: string;
  allLabel?: string; // adds a first option that clears the value ("Todas las tiendas")
  searchPlaceholder?: string;
  emptyText?: string;
  label?: string; // accessible name when there is no visible <label>
  id?: string;
  className?: string;
  onChange?: (value: string) => void;
  submitOnClear?: boolean; // filter forms: the ✕ that clears the choice also re-runs the filter
}

const icon = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
const ALL = "__all__";

export function Combobox({
  name, options, placeholder, defaultValue = "", allLabel, searchPlaceholder = "Buscar…", emptyText = "Sin resultados.", label, id, className = "", onChange, submitOnClear = false,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const [value, setValue] = useState(defaultValue);
  const [search, setSearch] = useState("");
  const hidden = useRef<HTMLInputElement>(null);
  const selected = options.find((o) => o.value === value);

  function pick(v: string) {
    setValue(v);
    setOpen(false);
    setSearch("");
    onChange?.(v);
  }

  function clear() {
    pick("");
    if (submitOnClear && hidden.current) {
      hidden.current.value = ""; // the state update lands after this tick; the form must already see it
      hidden.current.form?.requestSubmit();
    }
  }

  const xIcon = <svg {...icon} width={14} height={14}><path d="M18 6 6 18M6 6l12 12" /></svg>;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <input ref={hidden} type="hidden" name={name} value={value} />
      <span className="relative flex w-full items-center">
      <Popover.Trigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={label}
          className={`flex min-h-10 w-full items-center justify-between gap-2 rounded-md border border-neutral-300 bg-white px-3 py-2 text-left text-sm hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-blue-600/40 focus-visible:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800 ${className}`}
        >
          <span className={`truncate ${selected ? "" : "text-neutral-500"} ${allLabel && value ? "pr-7" : ""}`}>{selected?.label ?? (value ? value : placeholder)}</span>
          <svg {...icon} className="shrink-0 text-neutral-400"><path d="m7 15 5 5 5-5M7 9l5-5 5 5" /></svg>
        </button>
      </Popover.Trigger>
      {/* a sibling, not inside the trigger: a button can't contain another button */}
      {allLabel && value && (
        <button
          type="button"
          onClick={clear}
          aria-label={`Quitar ${selected?.label ?? value}`}
          className="absolute right-8 flex size-6 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
        >
          {xIcon}
        </button>
      )}
      </span>
      <Popover.Portal>
        <Popover.Content
          id={listId}
          align="start"
          sideOffset={4}
          className="z-50 w-(--radix-popover-trigger-width) min-w-64 overflow-hidden rounded-md border border-neutral-200 bg-white text-sm text-neutral-900 shadow-lg dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
        >
          <Command loop>
            <div className="flex items-center gap-2 border-b border-neutral-200 px-3 dark:border-neutral-800">
              <svg {...icon} className="shrink-0 text-neutral-400"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <Command.Input value={search} onValueChange={setSearch} placeholder={searchPlaceholder} className="h-10 w-full bg-transparent outline-none placeholder:text-neutral-500" />
              {search && (
                <button type="button" onClick={() => setSearch("")} aria-label="Borrar la búsqueda" className="flex size-6 shrink-0 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100">
                  {xIcon}
                </button>
              )}
            </div>
            <Command.List className="max-h-72 overflow-y-auto p-1">
              <Command.Empty className="px-2 py-6 text-center text-neutral-500">{emptyText}</Command.Empty>
              {allLabel && <Item label={allLabel} selected={!value} onSelect={() => pick("")} itemValue={ALL} />}
              {options.map((o) => (
                <Item key={o.value} label={o.label} hint={o.hint} selected={o.value === value} onSelect={() => pick(o.value)} itemValue={`${o.label} ${o.value}`} />
              ))}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Item({ label, hint, selected, onSelect, itemValue }: { label: string; hint?: string; selected: boolean; onSelect: () => void; itemValue: string }) {
  return (
    <Command.Item
      value={itemValue}
      onSelect={onSelect}
      className="flex min-h-9 cursor-pointer items-center gap-2 rounded-sm px-2 data-[selected=true]:bg-neutral-100 dark:data-[selected=true]:bg-neutral-800"
    >
      <svg {...icon} className={`shrink-0 ${selected ? "opacity-100" : "opacity-0"}`}><path d="M20 6 9 17l-5-5" /></svg>
      <span className="flex-1 truncate">{label}</span>
      {hint && <span className="shrink-0 text-xs text-neutral-500">{hint}</span>}
    </Command.Item>
  );
}
