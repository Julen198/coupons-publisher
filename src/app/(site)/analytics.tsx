"use client";

import { useEffect, useSyncExternalStore } from "react";
import { CONSENT_KEY, consentOf, type Consent } from "@/lib/analytics";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

// A GA4 event; does nothing when the tag isn't on the page (no GA_MEASUREMENT_ID, blocked, or in development)
export function trackEvent(name: string, params: Record<string, string | number | undefined> = {}) {
  try {
    window.gtag?.("event", name, params);
  } catch {
    // analytics never gets in the reader's way
  }
}

function readConsent(): Consent | null {
  try {
    return consentOf(localStorage.getItem(CONSENT_KEY));
  } catch {
    return "denied"; // no storage: we couldn't remember a choice, so don't ask on every page
  }
}

// localStorage as an external store, as in the theme toggle
const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function choose(c: Consent | null) {
  try {
    if (c) localStorage.setItem(CONSENT_KEY, c);
    else localStorage.removeItem(CONSENT_KEY);
  } catch {
    // private mode: the choice lasts this page only
  }
  if (c) window.gtag?.("consent", "update", { analytics_storage: c });
  listeners.forEach((l) => l());
}

// The cookie notice plus the click events; only rendered when the site has a measurement id
export function Analytics() {
  // the server renders no notice (null = "already chose"), so it only appears after hydration for readers who haven't chosen
  const consent = useSyncExternalStore(subscribe, readConsent, () => "denied" as const);

  // "Ir a la tienda" clicks, wherever the button is (lists, deal page, phone bar); GA adds the page it happened on
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const a = (e.target as Element | null)?.closest?.("a.go-btn");
      if (!(a instanceof HTMLAnchorElement)) return;
      trackEvent("click_chollo", { store: a.dataset.store, coupon_id: a.dataset.coupon });
    }
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  if (consent) return null;
  return (
    <div className="cookie-note" role="dialog" aria-live="polite" aria-label="Cookies">
      <p>
        Usamos cookies de analítica (Google Analytics) para saber qué chollos interesan y mejorar la web. No usamos cookies de publicidad.
      </p>
      <div className="cookie-actions">
        <button type="button" className="btn" onClick={() => choose("denied")}>Rechazar</button>
        <button type="button" className="btn btn-primary" onClick={() => choose("granted")}>Aceptar</button>
      </div>
    </div>
  );
}

// Footer link that brings the notice back so a reader can change their mind
export function CookieSettingsLink() {
  return (
    <button type="button" className="link-btn" onClick={() => choose(null)}>
      Cookies
    </button>
  );
}
