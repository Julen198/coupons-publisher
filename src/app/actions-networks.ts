"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { sql } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { requireAdmin, requireEditor } from "@/lib/auth";
import { fillStoreIcons } from "@/lib/fill-store-icons";
import { errorMessage, required, str, type FormState } from "@/lib/form";
import { adapterFor } from "@/lib/networks/index";
import { describeSync, recordSync, syncAccount, type NetworkAccount } from "@/lib/network-sync";
import { decryptJson, encryptJson } from "@/lib/secrets";
import type { Credentials } from "@/lib/networks/types";

export type SyncState = FormState & { result?: string };

// Credentials are admin-only. owner "" = our own account, otherwise a client's id.
// An owner can have several accounts of the same network (e.g. two Awin publisher ids): id = edit that one,
// no id = connect another. Leaving a secret blank on an existing account keeps the stored one.
export async function saveNetworkAccount(_prev: FormState, f: FormData): Promise<FormState> {
  try {
    await requireAdmin();
    const adapter = adapterFor(required(f, "network", "la red"));
    if (!adapter) throw new Error("Red no válida");
    const owner = str(f, "owner");
    const clientId = owner ? Number(owner) : null;
    if (clientId !== null) {
      const [client] = await sql()`SELECT id FROM clients WHERE id = ${clientId}`;
      if (!client) throw new Error("Cliente no encontrado");
    }
    const id = str(f, "id");
    const [existing] = id
      ? await sql()<{ id: number; credentials: string }[]>`
          SELECT id, credentials FROM network_accounts
          WHERE id = ${Number(id)} AND network = ${adapter.id} AND coalesce(client_id, 0) = ${clientId ?? 0}`
      : [];
    if (id && !existing) throw new Error("Cuenta no encontrada");
    const previous = existing ? decryptJson<Credentials>(existing.credentials) : {};
    const creds: Credentials = Object.fromEntries(
      adapter.fields.map((field) => {
        const v = str(f, field.name);
        if (v.length > 500) throw new Error(`${field.label}: demasiado largo`);
        return [field.name, v || (field.secret ? (previous[field.name] ?? "") : "")];
      }),
    );
    const missing = adapter.fields.filter((field) => !creds[field.name]);
    if (missing.length) throw new Error(`Falta ${missing.map((m) => m.label).join(", ")}`);
    const ref = adapter.ref(creds);
    const [dupe] = await sql()<{ id: number }[]>`
      SELECT id FROM network_accounts
      WHERE network = ${adapter.id} AND coalesce(client_id, 0) = ${clientId ?? 0} AND account_ref = ${ref}`;
    if (existing) {
      if (dupe && dupe.id !== existing.id) throw new Error(`Esa cuenta (${ref}) ya está conectada`);
      await sql()`
        UPDATE network_accounts SET account_ref = ${ref}, credentials = ${encryptJson(creds)}, last_error = ''
        WHERE id = ${existing.id}`;
    } else if (dupe) {
      // the same account entered again from "Conectar una red": refresh its credentials
      await sql()`UPDATE network_accounts SET credentials = ${encryptJson(creds)}, last_error = '' WHERE id = ${dupe.id}`;
    } else {
      await sql()`
        INSERT INTO network_accounts (network, client_id, account_ref, credentials)
        VALUES (${adapter.id}, ${clientId}, ${ref}, ${encryptJson(creds)})`;
    }
    await logActivity(`Cuenta de ${adapter.label} (${ref}) ${existing || dupe ? "actualizada" : "conectada"}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/networks");
  return {};
}

export async function deleteNetworkAccount(f: FormData) {
  await requireAdmin();
  const [row] = await sql()<{ network: string }[]>`DELETE FROM network_accounts WHERE id = ${Number(required(f, "id"))} RETURNING network`;
  if (row) await logActivity(`Cuenta de ${adapterFor(row.network)?.label ?? row.network} desconectada`);
  revalidatePath("/networks");
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
      // with several accounts of one network, the ref tells their results apart
      const net = adapterFor(account.network)?.label ?? account.network;
      const label = account.account_ref ? `${net} (${account.account_ref})` : net;
      try {
        const summary = await syncAccount(account);
        await recordSync(account, { summary });
        newStores.push(...summary.newStores);
        lines.push(`${label}: ${describeSync(summary)}`);
      } catch (e) {
        console.error("network sync failed", account.network, account.id, e);
        await recordSync(account, { error: errorMessage(e) });
        lines.push(`${label}: error — ${errorMessage(e)}`);
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
