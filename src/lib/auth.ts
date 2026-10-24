import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "./db";
import { SESSION_COOKIE, verifySession } from "./session";

export type Role = "admin" | "editor" | "viewer";

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  client_ids: number[];
  status: "pending" | "active" | "disabled";
  session_version: number;
  last_login_at: Date | null;
  created_at: Date;
}

export const ROLE_LABEL: Record<Role, string> = { admin: "Administrador", editor: "Editor", viewer: "Lector" };
export const ROLE_DESCRIPTION: Record<Role, string> = {
  admin: "Todas las secciones, todos los clientes y la administración del panel.",
  editor: "Crea y edita cupones, tiendas y páginas de sus clientes.",
  viewer: "Ve el resumen, las páginas y los clics de sus clientes.",
};

// The signed-in, active user for this request, or null
export async function getUser(): Promise<User | null> {
  const session = await verifySession(process.env.SESSION_SECRET, (await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const [user] = await sql()<User[]>`
    SELECT id, name, email, role, client_ids, status, session_version, last_login_at, created_at
    FROM users WHERE id = ${session.userId}`;
  if (!user || user.status !== "active" || user.session_version !== session.version) return null;
  return { ...user, client_ids: [...user.client_ids] };
}

// Pages: bounce to login. Actions: same (redirect works from server actions too).
export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "admin") throw new Error("Solo los administradores pueden hacer esto");
  return user;
}

// Anything that changes data: admins and editors, never viewers
export async function requireEditor(): Promise<User> {
  const user = await requireUser();
  if (user.role === "viewer") throw new Error("Tu rol es de solo lectura");
  return user;
}

export const canEdit = (user: User) => user.role !== "viewer";

// null = every client (admin); otherwise the ids this user may see
export const visibleClientIds = (user: User): number[] | null => (user.role === "admin" ? null : user.client_ids);

export const canSeeClient = (user: User, clientId: number) => user.role === "admin" || user.client_ids.includes(clientId);

export function onlyVisible<T extends { client_id?: number; id?: number }>(user: User, rows: T[], key: "client_id" | "id" = "client_id"): T[] {
  const ids = visibleClientIds(user);
  return ids ? rows.filter((r) => ids.includes(r[key] as number)) : rows;
}

export const initials = (name: string) =>
  name.split(/[\s._@-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
