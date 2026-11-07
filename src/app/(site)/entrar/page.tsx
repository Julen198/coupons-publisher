import type { Metadata } from "next";
import { EntrarCard } from "./entrar-card";

export const metadata: Metadata = { title: "Entrar", robots: { index: false } };

// Opened directly (an email link, a reload, a new tab) it is a page; from inside the site it opens as a modal (@modal/(.)entrar)
export default async function EntrarPage({ searchParams }: PageProps<"/entrar">) {
  const { next } = await searchParams;
  return (
    <main className="wrap">
      <div className="panel auth-card">
        <EntrarCard next={typeof next === "string" ? next : "/"} />
      </div>
    </main>
  );
}
