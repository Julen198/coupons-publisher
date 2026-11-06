"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { sql } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { requireAdmin, requireEditor } from "@/lib/auth";
import { fillStoreIcons } from "@/lib/fill-store-icons";
import { errorMessage, required, str, type FormState } from "@/lib/form";
import { adapterFor } from "@/lib/networks/index";
import { awinPublisherId } from "@/lib/networks/awin";
import { describeSync, recordSync, syncAccount, syncClientAwinIds, syncCredentials, type NetworkAccount } from "@/lib/network-sync";
import { decryptJson, encryptJson } from "@/lib/secrets";
import { networkError, type Credentials, type NetworkAdapter } from "@/lib/networks/types";

export type SyncState = FormState & { result?: string };

// Credentials are admin-only. owner "" = our own account, otherwise a client's id.
// Leaving a secret blank on an existing account keeps the stored one.
// They are checked by syncing once (as the affiliate checker does): only credentials that work get saved.
export async function saveNetworkAccount(_prev: FormState, f: FormData): Promise<FormState> {
  const adapter = adapterFor(str(f, "network"));
  try {
    await requireAdmin();
    if (!adapter) throw new Error("Red no válida");
    const owner = str(f, "owner");
    const clientId = owner ? Number(owner) : null;
    if (clientId !== null) {
      const [client] = await sql()`SELECT id FROM clients WHERE id = ${clientId}`;
      if (!client) throw new Error("Cliente no encontrado");
    }
    const { creds, existing } = await readCredentials(adapter, f, clientId);
    const summary = await syncCredentials(adapter, creds, clientId).catch((e: unknown) => {
      throw new Error(networkError(adapter, e), { cause: e });
    });
    await sql()`
      INSERT INTO network_accounts (network, client_id, account_ref, credentials, last_sync_at, last_result)
      VALUES (${adapter.id}, ${clientId}, ${adapter.ref(creds)}, ${encryptJson(creds)}, now(), ${describeSync(summary)})
      ON CONFLICT (network, coalesce(client_id, 0), account_ref) DO UPDATE SET
        credentials = excluded.credentials, last_sync_at = excluded.last_sync_at, last_result = excluded.last_result, last_error = ''`;
    await syncClientAwinIds();
    await logActivity(`Cuenta de ${adapter.label} ${existing ? "actualizada" : "conectada"}: ${describeSync(summary)}`);
    after(() => fillStoreIcons(summary.newStores));
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/", "layout");
  return {};
}

// The form's fields, checked, with the saved secrets where they were left blank. Awin's publisher id may be left
// empty: the token says which account it is (or lists them when it reaches several).
async function readCredentials(adapter: NetworkAdapter, f: FormData, clientId: number | null) {
  const typed: Credentials = Object.fromEntries(
    adapter.fields.map((field) => {
      const v = str(f, field.name);
      if (v.length > 500) throw new Error(`${field.label}: demasiado largo`);
      if (v && field.numeric && !/^\d+$/.test(v)) throw new Error(`${field.label}: solo números`);
      return [field.name, v];
    }),
  );
  const findAwinId = adapter.id === "awin" && !typed.publisherId;
  if (findAwinId && !typed.token) throw new Error("Falta API token");
  const entered: Credentials = findAwinId
    ? { ...typed, publisherId: await awinPublisherId(typed.token).catch((e: unknown) => { throw new Error(`Awin: ${errorMessage(e)}`, { cause: e }); }) }
    : typed;
  // one account per network, owner and publisher id: the same id updates it, a new id adds another account
  const [existing] = await sql()<{ credentials: string }[]>`
    SELECT credentials FROM network_accounts
    WHERE network = ${adapter.id} AND coalesce(client_id, 0) = ${clientId ?? 0} AND account_ref = ${adapter.ref(entered)}`;
  const previous = existing ? decryptJson<Credentials>(existing.credentials) : {};
  const creds: Credentials = Object.fromEntries(
    adapter.fields.map((field) => [field.name, entered[field.name] || (field.secret ? (previous[field.name] ?? "") : "")]),
  );
  const missing = adapter.fields.filter((field) => !creds[field.name] && !field.optional);
  if (missing.length) throw new Error(`Falta ${missing.map((m) => m.label).join(", ")}`);
  return { creds, existing: Boolean(existing) };
}

export async function deleteNetworkAccount(f: FormData) {
  await requireAdmin();
  const [row] = await sql()<{ network: string; client_id: number | null }[]>`DELETE FROM network_accounts WHERE id = ${Number(required(f, "id"))} RETURNING network, client_id`;
  // that client's links in this network go back to ours (unless it still has another account there, which re-sync refills)
  if (row?.client_id != null) await sql()`DELETE FROM client_tracking WHERE client_id = ${row.client_id} AND network = ${row.network}`;
  await syncClientAwinIds();
  if (row) await logActivity(`Cuenta de ${adapterFor(row.network)?.label ?? row.network} desconectada`);
  revalidatePath("/panel/networks");
}

// One account (id) or all of them (no id), one after another so a slow network doesn't hide the others' errors
export async function syncNetworks(_prev: SyncState, f: FormData): Promise<SyncState> {
  try {
    await requireEditor();
    const id = str(f, "id");
    const accounts = id
      ? await sql()<NetworkAccount[]>`SELECT * FROM network_accounts WHERE id = ${Number(id)}`
      : await sql()<NetworkAccount[]>`SELECT * FROM network_accounts ORDER BY id`;
    if (!accounts.length) throw new Error("No hay cuentas conectadas");
    const lines: string[] = [];
    const newStores: string[] = [];
    let failed = 0;
    for (const account of accounts) {
      const adapter = adapterFor(account.network);
      const label = adapter?.label ?? account.network;
      try {
        const summary = await syncAccount(account);
        await recordSync(account, { summary });
        newStores.push(...summary.newStores);
        lines.push(`${label}: ${describeSync(summary)}`);
      } catch (e) {
        console.error("network sync failed", account.network, account.id, e);
        const error = adapter ? networkError(adapter, e) : `${label}: ${errorMessage(e)}`;
        await recordSync(account, { error });
        lines.push(error);
        failed++;
      }
    }
    after(() => fillStoreIcons(newStores));
    revalidatePath("/", "layout");
    return failed === accounts.length ? { error: lines.join("\n") } : { result: lines.join("\n") };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
