// Line icons from the SiteEntrarModal / SiteEntrarVuelta boards. Decorative: always aria-hidden.
import type { ReactNode } from "react";

function Icon({ children, width = 2 }: { children: ReactNode; width?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export const TicketIcon = () => (
  <Icon><path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z" /><path d="M10 9l4 6" /></Icon>
);
export const MailIcon = ({ width }: { width?: number }) => (
  <Icon width={width}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></Icon>
);
export const ArrowIcon = () => <Icon width={2.2}><path d="M5 12h14M13 6l6 6-6 6" /></Icon>;
export const LockIcon = () => <Icon><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Icon>;
export const UpIcon = () => <Icon width={2.4}><path d="m6 15 6-6 6 6" /></Icon>;
export const ChatIcon = () => <Icon><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></Icon>;
export const BookmarkIcon = () => <Icon><path d="M6 4h12v17l-6-4-6 4z" /></Icon>;
export const PlusIcon = () => <Icon><path d="M12 5v14M5 12h14" /></Icon>;
export const CloseIcon = () => <Icon width={2.2}><path d="M6 6l12 12M18 6 6 18" /></Icon>;
export const AlertIcon = () => <Icon><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5v.5" /></Icon>;
export const CheckIcon = () => <Icon width={3}><path d="m5 12 5 5L20 7" /></Icon>;
