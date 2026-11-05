import Link from "next/link";
import { redirect } from "next/navigation";
import { setPublishUnverified, setRetention } from "@/app/actions-admin";
import { publishUnverified } from "@/lib/settings";
import { requireUser, ROLE_LABEL, initials, type Role } from "@/lib/auth";
import { clickRetention } from "@/lib/clicks";
import { listClients, sql } from "@/lib/db";
import { IMPORT_COLUMNS } from "@/lib/coupon-import";
import { cardCls, fmtDateTime, PageHeader } from "@/app/ui";
import { EditUserButton, ImportCouponsForm, InviteButton, WipeDataForm } from "./admin-ui";

interface UserRow {
  id: number; name: string; email: string; role: Role; client_ids: number[];
  status: "pending" | "active" | "disabled"; last_login_at: Date | null;
}

const ROLE_CLS: Record<Role, string> = {
  admin: "border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200",
  editor: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200",
  viewer: "border-neutral-300 bg-neutral-100 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
};
const STATUS = {
  active: ["Activo", "bg-green-100 text-green-900 dark:bg-green-900 dark:text-green-100"],
  pending: ["Invitación pendiente", "bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100"],
  disabled: ["Desactivado", "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"],
} as const;

const ROLES: { role: Role; text: string }[] = [
  { role: "admin", text: "Todo, incluida esta pantalla: usuarios, datos y ajustes." },
  { role: "editor", text: "Crea y edita cupones, tiendas y páginas de los clientes que tenga asignados." },
  { role: "viewer", text: "Solo ve el Resumen, las páginas y los clics de sus clientes. Ideal para el propio medio." },
];

const EXPORTS = [
  { table: "clients", label: "Clientes" },
  { table: "stores", label: "Tiendas" },
  { table: "coupons", label: "Cupones" },
  { table: "pages", label: "Páginas" },
  { table: "clicks", label: "Clics" },
] as const;

export default async function AdminPage({ searchParams }: PageProps<"/settings">) {
  const me = await requireUser();
  if (me.role !== "admin") redirect("/panel");
  const [sp, clients, users, counts, retention, unverified] = await Promise.all([
    searchParams,
    listClients(),
    sql()<UserRow[]>`SELECT id, name, email, role, client_ids, status, last_login_at FROM users ORDER BY role, lower(name)`,
    sql()<Record<string, number>[]>`
      SELECT (SELECT count(*) FROM clients)::int AS clients, (SELECT count(*) FROM stores)::int AS stores,
             (SELECT count(*) FROM coupons)::int AS coupons, (SELECT count(*) FROM pages)::int AS pages,
             (SELECT count(*) FROM clicks)::int AS clicks`,
    clickRetention(),
    publishUnverified(),
  ]);
  const tab = sp.tab === "data" ? "data" : "users";
  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  const clientOpts = clients.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Solo administradores" title="Administración">
        {tab === "users" && <InviteButton clients={clientOpts} />}
      </PageHeader>

      <nav aria-label="Secciones de administración" className="flex gap-1 border-b border-neutral-200 dark:border-neutral-800">
        {[["users", `Usuarios · ${users.length}`], ["data", "Datos"]].map(([id, label]) => (
          <Link
            key={id}
            href={{ query: { tab: id } }}
            aria-current={tab === id ? "page" : undefined}
            className={`-mb-px flex min-h-11 items-center border-b-2 px-3 text-sm ${tab === id ? "border-blue-700 font-semibold text-blue-900 dark:border-blue-400 dark:text-blue-200" : "border-transparent text-neutral-600 dark:text-neutral-400"}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {tab === "users" && (
        <>
          <section aria-label="Roles" className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
            {ROLES.map((r) => (
              <div key={r.role} className={`${cardCls} flex flex-col gap-2`}>
                <span className={`self-start rounded-full border px-2.5 py-0.5 text-xs font-semibold ${ROLE_CLS[r.role]}`}>{ROLE_LABEL[r.role]}</span>
                <span className="text-sm text-neutral-700 dark:text-neutral-300">{r.text}</span>
              </div>
            ))}
          </section>

          <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-neutral-50 text-left text-xs text-neutral-500 dark:bg-neutral-900">
                <tr>
                  <th className="px-5 py-3 font-semibold">Usuario</th>
                  <th className="px-2 py-3 font-semibold">Rol</th>
                  <th className="px-2 py-3 font-semibold">Acceso a clientes</th>
                  <th className="px-2 py-3 font-semibold">Último acceso</th>
                  <th className="px-2 py-3 font-semibold">Estado</th>
                  <th className="px-5 py-3"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-3">
                        <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-xs font-semibold text-neutral-700 dark:bg-neutral-700 dark:text-neutral-100">{initials(u.name)}</span>
                        <span className="flex flex-col">
                          <span className="font-medium">{u.name}{u.id === me.id && <span className="ml-1.5 text-xs font-normal text-neutral-500">(tú)</span>}</span>
                          <span className="text-xs text-neutral-500">{u.email}</span>
                        </span>
                      </span>
                    </td>
                    <td className="px-2 py-3"><span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${ROLE_CLS[u.role]}`}>{ROLE_LABEL[u.role]}</span></td>
                    <td className="px-2 py-3 text-neutral-700 dark:text-neutral-300">
                      {u.role === "admin" ? "Todos los clientes" : u.client_ids.map((id) => clientName.get(id)).filter(Boolean).join(", ") || <span className="text-amber-700 dark:text-amber-400">Ninguno</span>}
                    </td>
                    <td className="px-2 py-3 text-xs text-neutral-500">{u.last_login_at ? fmtDateTime(u.last_login_at) : "—"}</td>
                    <td className="px-2 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${STATUS[u.status][1]}`}>{STATUS[u.status][0]}</span></td>
                    <td className="px-5 py-3 text-right">
                      <EditUserButton user={{ id: u.id, name: u.name, email: u.email, role: u.role, client_ids: [...u.client_ids], status: u.status }} clients={clientOpts} isMe={u.id === me.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "data" && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] items-start gap-6">
          {sp.wiped && <p role="status" className="col-span-full rounded-lg bg-green-50 px-4 py-3 text-sm text-green-900 dark:bg-green-950 dark:text-green-200">Datos borrados. Los usuarios se mantienen.</p>}

          <section aria-labelledby="exp" className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
            <div className="border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
              <h2 id="exp" className="font-semibold">Exportar datos</h2>
              <p className="text-sm text-neutral-500">Un CSV por tabla, con todos los registros.</p>
            </div>
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {EXPORTS.map((e) => (
                <li key={e.table} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <span className="flex-1 font-medium">{e.label}</span>
                  <span className="text-xs text-neutral-500 tabular-nums">{(counts[0]?.[e.table] ?? 0).toLocaleString("es-ES")} registros</span>
                  <a href={`/api/export/${e.table}`} download className="flex min-h-9 items-center rounded-md border border-neutral-300 px-3 text-xs font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900">Descargar CSV</a>
                </li>
              ))}
            </ul>
          </section>

          <div className="flex flex-col gap-6">
            <section aria-labelledby="imp" className={`${cardCls} flex flex-col gap-3`}>
              <div>
                <h2 id="imp" className="font-semibold">Importar cupones</h2>
                <p className="text-sm text-neutral-500">
                  CSV con las columnas <span className="font-mono text-xs">{IMPORT_COLUMNS.join(", ")}</span>. Solo «tienda» y «titulo» son obligatorias; la tienda tiene que existir. Los duplicados se ignoran.
                </p>
              </div>
              <ImportCouponsForm />
              <a href="/api/export/coupon-template" download className="text-sm text-blue-700 hover:underline dark:text-blue-300">Descargar plantilla CSV</a>
            </section>

            <form action={setPublishUnverified} className={`${cardCls} flex flex-col gap-3`}>
              <h2 className="font-semibold">Modo demo</h2>
              <label className="flex items-start gap-2.5 text-sm">
                <input type="checkbox" name="publish_unverified" defaultChecked={unverified} className="mt-0.5 size-4" />
                <span className="flex flex-col">
                  Publicar cupones sin verificar
                  <span className="text-xs text-neutral-500">Los cupones encontrados en internet salen en las páginas, el widget y las demos aunque nadie los haya revisado. Desactívalo antes de trabajar con clientes reales.</span>
                </span>
              </label>
              <button className="min-h-10 self-start rounded-md border border-neutral-300 px-4 text-sm font-medium dark:border-neutral-700">Guardar</button>
            </form>

            <form action={setRetention} className={`${cardCls} flex flex-col gap-3`}>
              <h2 className="font-semibold">Guardar clics durante</h2>
              <div role="radiogroup" aria-label="Retención de clics" className="flex flex-wrap gap-2">
                {[["90", "90 días"], ["365", "1 año"], ["all", "Siempre"]].map(([v, label]) => (
                  <label key={v} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-neutral-300 px-3 text-sm has-[:checked]:border-2 has-[:checked]:border-blue-700 has-[:checked]:bg-blue-50 has-[:checked]:font-semibold dark:border-neutral-700 dark:has-[:checked]:border-blue-400 dark:has-[:checked]:bg-blue-950">
                    <input type="radio" name="retention" value={v} defaultChecked={retention === v} className="size-4" />
                    {label}
                  </label>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <button className="min-h-10 rounded-md border border-neutral-300 px-4 text-sm font-medium dark:border-neutral-700">Guardar</button>
                <span className="text-xs text-neutral-500">Los clics más antiguos se borran al consultar las estadísticas.</span>
              </div>
            </form>
          </div>

          <section aria-labelledby="danger" className="col-span-full overflow-hidden rounded-lg border border-red-200 dark:border-red-900">
            <h2 id="danger" className="border-b border-red-200 bg-red-50 px-5 py-3 font-semibold text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">Zona de peligro</h2>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
              <span className="flex flex-[1_1_320px] flex-col">
                <span className="text-sm font-semibold">Borrar todos los datos</span>
                <span className="text-sm text-neutral-500">Elimina clientes, tiendas, cupones, páginas, clics y actividad. Los usuarios y los ajustes se mantienen.</span>
              </span>
              <WipeDataForm />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
