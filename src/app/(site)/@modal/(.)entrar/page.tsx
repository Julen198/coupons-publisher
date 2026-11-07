import { EntrarCard } from "../../entrar/entrar-card";
import { Modal } from "../modal";

export default async function EntrarModal({ searchParams }: PageProps<"/entrar">) {
  const { next } = await searchParams;
  return (
    <Modal labelledBy="entrar-modal-h">
      <EntrarCard next={typeof next === "string" ? next : "/"} heading="h2" id="entrar-modal-h" />
    </Modal>
  );
}
