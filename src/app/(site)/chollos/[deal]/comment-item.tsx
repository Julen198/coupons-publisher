import Link from "next/link";
import { timeAgo, usefulLabel } from "@/lib/community";
import type { DealComment } from "@/lib/public-site";
import { toggleHelpful } from "../../actions-reader";
import { CommentForm } from "./comment-form";

type Viewer = { id: number; handle: string | null } | null;

// One comment or reply: author line, text, and the "útiles" / "Responder" footer
export function CommentItem({ m, now, path, couponId, live, viewer, replying }: {
  m: DealComment;
  now: Date;
  path: string; // the deal page, to come back to after signing in or toggling
  couponId: number;
  live: boolean;
  viewer: Viewer;
  replying: boolean; // the reply form is open under this comment
}) {
  const back = `${path}#c${m.id}`;
  const signIn = `/entrar?next=${encodeURIComponent(`${path}#comentarios`)}`;
  const own = viewer?.id === m.reader_id;
  return (
    <>
      <article id={`c${m.id}`} className={`cm${m.parent_id ? " reply" : ""}`}>
        <div className="cm-h">
          <b>@{m.handle}</b>
          {m.by_sharer && <span className="op">Autor</span>}
          <span>{timeAgo(new Date(m.created_at), now)}</span>
        </div>
        <p>{m.body}</p>
        <div className="cm-f">
          {!live || own ? (
            <span>{usefulLabel(m.helpful)}</span>
          ) : !viewer ? (
            <Link href={signIn}>{usefulLabel(m.helpful)}</Link>
          ) : (
            <form action={toggleHelpful}>
              <input type="hidden" name="comment_id" value={m.id} />
              <input type="hidden" name="next" value={back} />
              <button aria-pressed={m.mine}>{usefulLabel(m.helpful)}</button>
            </form>
          )}
          {live && (!viewer ? <Link href={signIn}>Responder</Link> : <Link href={`${path}?responder=${m.id}#c${m.id}`} scroll={false}>Responder</Link>)}
        </div>
      </article>
      {live && replying && viewer?.handle && (
        <div className={m.parent_id ? "reply" : undefined}>
          <CommentForm couponId={couponId} parentId={m.id} next={`${path}#comentarios`} />
        </div>
      )}
    </>
  );
}
