import { cache } from "react";
import { io } from "next/cache";
import { sql } from "./db";

// Admin switch for demos: unverified coupons found on the web also go out on clients' pages
export const publishUnverified = cache(async (): Promise<boolean> => {
  await io();
  const [row] = await sql()<{ value: string }[]>`SELECT value FROM settings WHERE key = 'publish_unverified'`;
  return row?.value === "1";
});

// Reader accounts on the public site (/entrar, comments, Guardar, avisos…): off unless an admin turns them on in
// Administración. Off, nobody can sign in or register and old reader sessions are ignored; accounts and their data stay.
export const READER_ACCOUNTS_KEY = "reader_accounts";
export const readerAccountsEnabled = cache(async (): Promise<boolean> => {
  await io();
  const [row] = await sql()<{ value: string }[]>`SELECT value FROM settings WHERE key = ${READER_ACCOUNTS_KEY}`;
  return row?.value === "1";
});
