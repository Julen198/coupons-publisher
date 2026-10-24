import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { NewClientForm } from "./new-client-form";

export default async function NewClientPage() {
  if ((await requireUser()).role !== "admin") redirect("/clients");
  return (
    <div className="flex flex-col gap-4">
      <Link href="/clients" className="text-sm text-neutral-500 hover:underline">← Clientes</Link>
      <h1 className="text-2xl font-semibold">Nuevo cliente</h1>
      <NewClientForm />
    </div>
  );
}
