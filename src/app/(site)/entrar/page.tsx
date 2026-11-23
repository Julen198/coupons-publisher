import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { safeNext } from "@/lib/session";
import { readerAccountsEnabled } from "@/lib/settings";
import { EntrarCard } from "./entrar-card";
import { OverHome } from "./over-home";

export const metadata: Metadata = { title: "Entrar", robots: { index: false } };

// Opened directly (an email link, a reload, a new tab): the modal over the home; from inside the site @modal/(.)entrar
// opens it over the current page
export default async function EntrarPage({ searchParams }: PageProps<"/entrar">) {
  if (!(await readerAccountsEnabled())) notFound(); // reader accounts are off (Administración)
  const { next } = await searchParams;
  const target = typeof next === "string" ? next : "/";
  return (
    <OverHome at="/entrar" closeTo={safeNext(target, "/")} labelledBy="entrar-h">
      <EntrarCard next={target} />
    </OverHome>
  );
}
