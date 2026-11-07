import type { ReactNode } from "react";

// The green confirmation box after a form is sent (SiteEntrar board, `.ok`)
export function OkNote({ children }: { children: ReactNode }) {
  return (
    <div className="ok" role="status">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m5 12 5 5L20 7" />
      </svg>
      <span>{children}</span>
    </div>
  );
}
