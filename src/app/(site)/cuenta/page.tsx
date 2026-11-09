import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ACCOUNT_TABS, accountHref, accountTabOf, liveFirst, sharedStatus } from "@/lib/account";
import { timeAgo } from "@/lib/community";
import { SHARE_LIMIT_NOTE, SHARING_ENABLED } from "@/lib/community-rules";
import { readerComments, readerSavedDeals, readerSharedDeals, readerStats, type AccountCoupon } from "@/lib/public-site";
import { getReader } from "@/lib/reader";
import { dealPath } from "@/lib/site-text";
import { toggleSaved } from "../actions-reader";
import { DealPicture, titleOf } from "../site-ui";

export const metadata: Metadata = { title: "Tu cuenta", robots: { index: false } };

const count = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);
const signed = (n: number) => (n > 0 ? `+${n.toLocaleString("es-ES")}` : n.toLocaleString("es-ES"));

function DealTitle({ c }: { c: AccountCoupon }) {
  return c.page ? <Link href={dealPath(c)}>{titleOf(c)}</Link> : <>{titleOf(c)}</>;
}

function SharedList({ rows, now }: { rows: AccountCoupon[]; now: Date }) {
  if (!rows.length) return <p className="small">Todavía no has compartido ningún chollo. <Link href="/compartir">Comparte el primero</Link></p>;
  return (
    <ul className="acct-list">
      {rows.map((c) => {
        const st = sharedStatus(c);
        return (
          <li key={c.id}>
            <span className="ti"><DealPicture c={c} /></span>
            <span>
              <b><DealTitle c={c} /></b>
              <small>
                {c.store_name} · {timeAgo(new Date(c.created_at), now)}
                {st.label === "Publicado" && <> · {signed(c.score)} · {count(c.comments, "comentario", "comentarios")}</>}
              </small>
            </span>
            <span className={`badge ${st.badge}`}>{st.label}</span>
          </li>
        );
      })}
    </ul>
  );
}

function SavedList({ rows }: { rows: AccountCoupon[] }) {
  if (!rows.length) return <p className="small">No has guardado ningún chollo. Pulsa «Guardar» en un chollo para tenerlo aquí.</p>;
  return (
    <ul className="acct-list">
      {liveFirst(rows).map((c) => (
        <li key={c.id}>
          <span className="ti"><DealPicture c={c} /></span>
          <span>
            <b><DealTitle c={c} /></b>
            <small>
              {c.store_name}
              {!c.live && <> · <span className="badge b-exp">Caducado</span></>}
            </small>
          </span>
          <form action={toggleSaved}>
            <input type="hidden" name="coupon_id" value={c.id} />
            <input type="hidden" name="next" value="0" />
            <input type="hidden" name="back" value={accountHref("guardados")} />
            <button className="btn" type="submit">Quitar</button>
          </form>
        </li>
      ))}
    </ul>
  );
}

async function CommentList({ readerId, now }: { readerId: number; now: Date }) {
  const rows = await readerComments(readerId);
  if (!rows.length) return <p className="small">Todavía no has comentado ningún chollo.</p>;
  return (
    <ul className="acct-list acct-comments">
      {rows.map((k) => (
        <li key={k.id}>
          <span>
            <b><Link href={`${dealPath({ id: k.coupon_id, title: k.title, store_name: k.store_name })}#comentarios`}>{titleOf(k)}</Link></b>
            <small>{k.store_name} · {timeAgo(new Date(k.created_at), now)}</small>
            <span className="acct-body">{k.body}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export default async function CuentaPage({ searchParams }: PageProps<"/cuenta">) {
  const reader = await getReader();
  if (!reader) redirect("/entrar?next=/cuenta");
  if (!reader.handle) redirect("/entrar/nombre?next=/cuenta");
  const tab = accountTabOf((await searchParams).tab);
  const now = new Date();
  const [stats, shared, saved] = await Promise.all([
    readerStats(reader.id),
    tab === "compartidos" ? readerSharedDeals(reader.id) : Promise.resolve([]),
    tab === "guardados" ? readerSavedDeals(reader.id) : Promise.resolve([]),
  ]);
  return (
    <main className="wrap">
      <section className="panel acct" aria-labelledby="cuenta-h1">
        <h1 id="cuenta-h1">@{reader.handle}</h1>
        <div className="acct-stats">
          {SHARING_ENABLED && <span><b>{stats.shared.toLocaleString("es-ES")}</b>{stats.shared === 1 ? "chollo compartido" : "chollos compartidos"}</span>}
          <span><b>{signed(stats.votes)}</b>{stats.votes === 1 || stats.votes === -1 ? "voto recibido" : "votos recibidos"}</span>
          <span><b>{stats.comments.toLocaleString("es-ES")}</b>{stats.comments === 1 ? "comentario" : "comentarios"}</span>
        </div>
        <nav className="tabs" aria-label="Sección">
          {ACCOUNT_TABS.map((t) => (
            <Link key={t.slug} href={accountHref(t.slug)} aria-current={t.slug === tab ? "page" : undefined}>{t.label}</Link>
          ))}
        </nav>
        {tab === "compartidos" && <SharedList rows={shared} now={now} />}
        {/* true since shareDeal skips rejected shares in its count (SHARE_LIMIT_SKIPS) */}
        {tab === "compartidos" && shared.length > 0 && <p className="small">{SHARE_LIMIT_NOTE}</p>}
        {tab === "guardados" && <SavedList rows={saved} />}
        {tab === "comentarios" && <CommentList readerId={reader.id} now={now} />}
      </section>
    </main>
  );
}
