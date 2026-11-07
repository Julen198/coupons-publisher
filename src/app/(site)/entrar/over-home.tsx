import type { ReactNode } from "react";
import { Modal } from "../@modal/modal";
import HomePage from "../page";

// The sign-in cards are always a modal over content. Opened from inside the site, @modal/(.)entrar puts it over the page
// the reader was on; opened directly (the email link, a reload, a new tab) there is no such page, so the home goes behind,
// dimmed and inert. Sent open by the server so the card shows on first paint and works without JS.
export function OverHome({ at, closeTo, labelledBy, children }: { at: string; closeTo: string; labelledBy: string; children: ReactNode }) {
  return (
    <>
      <div inert aria-hidden="true">
        <HomePage params={Promise.resolve({})} searchParams={Promise.resolve({})} />
      </div>
      <Modal labelledBy={labelledBy} at={at} closeTo={closeTo} openOnLoad>
        {children}
      </Modal>
    </>
  );
}
