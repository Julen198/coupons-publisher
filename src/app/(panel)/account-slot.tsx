import { requireUser, ROLE_DESCRIPTION, ROLE_LABEL } from "@/lib/auth";
import { AccountMenu } from "./account-menu";

// Reads the session (request-time), so the layout renders it inside <Suspense>
export async function AccountSlot() {
  const user = await requireUser();
  return (
    <AccountMenu
      name={user.name}
      email={user.email}
      role={ROLE_LABEL[user.role]}
      roleKey={user.role}
      description={ROLE_DESCRIPTION[user.role]}
      isAdmin={user.role === "admin"}
    />
  );
}
