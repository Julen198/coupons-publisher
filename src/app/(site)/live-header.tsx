import { getReader } from "@/lib/reader";
import { SiteHeader } from "./site-header";

// Reads the signed-in reader on the server, so the client header never touches cookies
export async function LiveHeader() {
  const reader = await getReader();
  return <SiteHeader live reader={reader ? { handle: reader.handle } : null} />;
}
