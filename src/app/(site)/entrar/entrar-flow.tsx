"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { RESEND_SECONDS, resendLabel } from "@/lib/reader-entry";
import { requestReaderLink } from "../actions-reader";
import { ArrowIcon, BookmarkIcon, ChatIcon, LockIcon, MailIcon, PlusIcon, TicketIcon, UpIcon } from "./icons";

type Heading = "h1" | "h2";
type Props = { next: string; heading: Heading; id: string };

// The whole card: the email form, then "Revisa tu email" in the same place (SiteEntrarModal board, states 1 and 2).
// The address shown is the one typed here, never anything the server looked up.
export function EntrarFlow({ next, heading, id }: Props) {
  const [state, formAction, pending] = useActionState(requestReaderLink, {});
  const [email, setEmail] = useState("");
  // "Usar otro email" dismisses this particular result; the next send is a new state object and shows again
  const [dismissed, setDismissed] = useState<typeof state | null>(null);
  const sent = !!state.sent && dismissed !== state;
  return (
    <>
      {sent ? (
        <SentView key={stateKey(state)} email={email} next={next} heading={heading} id={id} action={formAction} pending={pending} onOtherEmail={() => setDismissed(state)} />
      ) : (
        <FormView email={email} setEmail={setEmail} next={next} heading={heading} id={id} action={formAction} pending={pending} error={state.error} />
      )}
      {/* stays mounted, so the change of state is announced (a region inserted with its text often is not) */}
      <p className="sr-only" aria-live="polite">{sent ? `Te hemos mandado un enlace a ${email}.` : ""}</p>
    </>
  );
}

// each send result is a fresh object: a new key remounts SentView, restarting the countdown and moving focus
const keys = new WeakMap<object, number>();
let lastKey = 0;
function stateKey(s: object) {
  if (!keys.has(s)) keys.set(s, ++lastKey);
  return keys.get(s)!;
}

type FormProps = Props & { email: string; setEmail: (v: string) => void; action: (f: FormData) => void; pending: boolean; error?: string };

function FormView({ email, setEmail, next, heading: H, id, action, pending, error }: FormProps) {
  return (
    <>
      <span className="entry-mark" aria-hidden="true"><TicketIcon /></span>
      <div className="entry-head">
        <H id={id}>Entra en CuponLab</H>
        <p className="lead">Sin contraseña. Te mandamos un enlace al email<span className="entry-wide"> y entras con un clic</span>.</p>
      </div>
      <form action={action} className="entry-form">
        <input type="hidden" name="next" value={next} />
        <label className="entry-field">
          Email
          <span className="entry-input">
            <MailIcon />
            <input
              type="email" name="email" autoComplete="email" inputMode="email" placeholder="tu@email.es" required autoFocus
              value={email} onChange={(e) => setEmail(e.target.value)}
              aria-invalid={error ? true : undefined} aria-describedby={error ? "entrar-error" : undefined}
            />
          </span>
        </label>
        {error && <p id="entrar-error" role="alert" className="auth-error">{error}</p>}
        <button className="btn btn-primary entry-btn" disabled={pending}>
          {pending ? "Enviando…" : <>Enviarme el enlace<ArrowIcon /></>}
        </button>
        <p className="entry-trust"><LockIcon />El enlace caduca en 15 minutos. Sin spam.</p>
      </form>
      <div className="entry-perks">
        <b>Con tu cuenta</b>
        <ul>
          <li><span><UpIcon /></span>Votas chollos</li>
          <li><span><ChatIcon /></span>Comentas</li>
          <li><span><BookmarkIcon /></span>Guardas para luego</li>
          <li><span><PlusIcon /></span>Compartes los tuyos</li>
        </ul>
        <p className="entry-muted">Eliges un nombre público como <span className="entry-handle">@tu_nombre</span>.</p>
      </div>
      <p className="entry-muted entry-perks-line">Con tu cuenta votas, comentas, guardas y compartes chollos.</p>
    </>
  );
}

type SentProps = Props & { email: string; action: (f: FormData) => void; pending: boolean; onOtherEmail: () => void };

function SentView({ email, next, heading: H, id, action, pending, onOtherEmail }: SentProps) {
  const [left, setLeft] = useState(RESEND_SECONDS);
  const headRef = useRef<HTMLHeadingElement>(null);
  // the form that had focus is gone: hand focus to the new heading so it is read out and Tab continues from here
  useEffect(() => headRef.current?.focus(), []);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return (
    <div className="entry-sent">
      <span className="entry-okmark" aria-hidden="true"><MailIcon width={2.4} /></span>
      <div className="entry-head">
        <H id={id} ref={headRef} tabIndex={-1}>Revisa tu email</H>
        <p className="lead">
          Te hemos mandado un enlace a<br />
          <span className="entry-mail">{email}</span>
        </p>
      </div>
      <p className="entry-muted">Ábrelo en este dispositivo para entrar. Caduca en 15 minutos. Si no lo ves, mira en spam o promociones.</p>
      <form action={action} className="entry-actions">
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="email" value={email} />
        <button className="btn entry-btn" disabled={left > 0 || pending}>
          {pending ? "Enviando…" : resendLabel(left)}
        </button>
        {/* said once when the wait is over, not every second */}
        <span className="sr-only" aria-live="polite">{left > 0 ? "" : "Ya puedes pedir otro enlace."}</span>
        <button type="button" className="entry-link" onClick={onOtherEmail}>Usar otro email</button>
      </form>
    </div>
  );
}
