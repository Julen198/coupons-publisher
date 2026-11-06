import Link from "next/link";
import { Suspense } from "react";
import { Nav, NavList } from "@/app/nav";
import { getUser } from "@/lib/auth";
import { REVIEW_BOT_URL, channelUrl } from "@/lib/telegram";
import { AccountSlot } from "./account-slot";

export default function PanelLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-wrap">
      <aside className="flex w-full flex-col gap-6 border-neutral-200 bg-neutral-50 px-4 py-6 md:sticky md:top-0 md:h-screen md:w-58 md:border-r dark:border-neutral-800 dark:bg-neutral-950">
        <Link href="/" className="flex items-center gap-2 px-3 text-[15px] font-bold whitespace-nowrap" aria-label="CuponLab, ir a la portada">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-blue-700 dark:text-blue-400">
            <path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z" />
            <path d="M10 9l4 6" />
          </svg>
          CuponLab
        </Link>
        <Suspense fallback={<NavList />}>
          <NavSlot />
        </Suspense>
        <div className="border-t border-neutral-200 pt-3 md:mt-auto dark:border-neutral-800">
          <Suspense fallback={<div className="h-11 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-800" />}>
            <AccountSlot />
          </Suspense>
        </div>
      </aside>
      <main className="min-w-0 flex-1 basis-[560px] px-6 py-8 md:px-10">
        {/* every panel page reads the database at request time */}
        <Suspense fallback={<p className="text-sm text-neutral-500">Cargando…</p>}>{children}</Suspense>
      </main>
    </div>
  );
}

const TELEGRAM_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="shrink-0 text-sky-500">
    <path d="M21.9 4.3 18.7 19.4c-.2 1.1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.3-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6.2 13.1l-4.8-1.5c-1-.3-1.1-1 .2-1.5L20.5 2.9c.9-.3 1.6.2 1.4 1.4z" />
  </svg>
);

const ITEM = "flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm";

function TelegramLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`${ITEM} text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800`}>
      {TELEGRAM_ICON}
      {label}
      <span aria-hidden="true" className="ml-auto text-xs text-neutral-400">↗</span>
      <span className="sr-only">(se abre en otra pestaña)</span>
    </a>
  );
}

// Public channel for everyone (greyed out until TELEGRAM_CHANNEL_ID is a public @username); the review bot for admins only
function TelegramLinks({ admin }: { admin: boolean }) {
  const channel = channelUrl();
  return (
    <div className="-mt-5 flex flex-col gap-1">
      {channel ? (
        <TelegramLink href={channel} label="Canal de Telegram" />
      ) : (
        <p className={`${ITEM} text-neutral-400 dark:text-neutral-500`} title="Falta crear el canal y poner TELEGRAM_CHANNEL_ID">
          {TELEGRAM_ICON}
          Canal de Telegram
          <span className="ml-auto text-[11px]">pendiente</span>
        </p>
      )}
      {admin && <TelegramLink href={REVIEW_BOT_URL} label="Bot de revisión" />}
    </div>
  );
}

// admin-only entries (Costes de IA, the review bot) need the user, which is read at request time
async function NavSlot() {
  const admin = (await getUser())?.role === "admin";
  return (
    <>
      <Nav admin={admin} />
      <TelegramLinks admin={admin} />
    </>
  );
}
