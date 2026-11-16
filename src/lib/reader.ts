import { cookies } from "next/headers";
import { sql } from "./db";
import { READER_COOKIE, verifyReader } from "./session";
import { readerAccountsEnabled } from "./settings";

export type Reader = { id: number; email: string; handle: string | null; status: "active" | "blocked"; session_version: number };

// The signed cookie says who; the row says whether they may still be in (not blocked, session not revoked).
// With reader accounts off in Administración nobody is signed in: the cookie is ignored, not deleted, so turning
// them back on brings readers back as they were.
export async function getReader(): Promise<Reader | null> {
  if (!(await readerAccountsEnabled())) return null;
  const token = (await cookies()).get(READER_COOKIE)?.value;
  const session = await verifyReader(process.env.SESSION_SECRET, token);
  if (!session) return null;
  const [reader] = await sql()<Reader[]>`
    SELECT id, email, handle, status, session_version FROM readers
    WHERE id = ${session.readerId} AND status = 'active' AND session_version = ${session.version}`;
  return reader ?? null;
}
