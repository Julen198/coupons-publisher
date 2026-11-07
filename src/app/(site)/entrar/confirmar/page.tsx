import type { Metadata } from "next";
import Link from "next/link";
import { safeNext } from "@/lib/session";
import { confirmReaderLink } from "../../actions-reader";
import { AlertIcon, ArrowIcon, TicketIcon } from "../icons";
import { Modal } from "../../@modal/modal";
import HomePage from "../../page";

export const metadata: Metadata = { title: "Entrar", robots: { index: false } };

// The emailed link lands here (SiteEntrarVuelta board, step 2). Signing in needs the button press (a POST),
// so link prefetchers and mail scanners can't burn the token. The card floats over the home page, dimmed behind it
// (SiteHeaderMobile board, step 4); closing it leaves the reader on that page.
export default async function ConfirmarPage({ searchParams }: PageProps<"/entrar/confirmar">) {
  const { token, next, invalid } = await searchParams;
  const target = safeNext(typeof next === "string" ? next : null, "/");
  return (
    <>
      <div inert aria-hidden="true">
        <HomePage params={Promise.resolve({})} searchParams={Promise.resolve({})} />
      </div>
      <Modal labelledBy="confirmar-h" at="/entrar/confirmar" closeTo={target}>
        {invalid ? (
          <>
            <span className="entry-mark entry-mark-warn" aria-hidden="true"><AlertIcon /></span>
            <div className="entry-head">
              <h1 id="confirmar-h">Este enlace ya no sirve</h1>
              <p className="lead">Los enlaces caducan a los 15 minutos y solo sirven una vez.</p>
            </div>
            <Link href={`/entrar?next=${encodeURIComponent(target)}`} className="btn btn-primary entry-btn">Pedir otro enlace</Link>
          </>
        ) : (
          <>
            <span className="entry-mark" aria-hidden="true"><TicketIcon /></span>
            <div className="entry-head">
              <h1 id="confirmar-h">Ya casi estás</h1>
              <p className="lead">Pulsa para entrar en CuponLab en este dispositivo.</p>
            </div>
            <form action={confirmReaderLink} className="entry-form">
              <input type="hidden" name="token" value={typeof token === "string" ? token : ""} />
              <input type="hidden" name="next" value={target} />
              <button className="btn btn-primary entry-btn">Entrar en CuponLab<ArrowIcon /></button>
            </form>
            <p className="entry-muted">Un clic más para que los antivirus que abren enlaces no gasten el tuyo.</p>
          </>
        )}
      </Modal>
    </>
  );
}
