import { notFound } from "next/navigation";
import { readerAccountsEnabled } from "@/lib/settings";
import { EntrarCard } from "../../entrar/entrar-card";
import { Modal } from "../modal";

export default async function EntrarModal({ searchParams }: PageProps<"/entrar">) {
  if (!(await readerAccountsEnabled())) notFound();
  const { next } = await searchParams;
  return (
    <Modal labelledBy="entrar-modal-h">
      <EntrarCard next={typeof next === "string" ? next : "/"} heading="h2" id="entrar-modal-h" />
    </Modal>
  );
}
