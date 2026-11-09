import { redirect } from "next/navigation";

// Clics is now the «Clics por medio» tab of Estadísticas; old links and bookmarks keep their filters
export default async function ClicksPage({ searchParams }: PageProps<"/panel/clicks">) {
  const sp = await searchParams;
  const q = new URLSearchParams({ tab: "clics" });
  for (const k of ["days", "client"]) {
    const v = sp[k];
    if (typeof v === "string") q.set(k, v);
  }
  redirect(`/panel/estadisticas?${q}`);
}
