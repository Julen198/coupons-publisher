import { cache } from "react";
import { io } from "next/cache";
import { sql } from "./db";

// Admin switch for demos: unverified coupons found on the web also go out on clients' pages
export const publishUnverified = cache(async (): Promise<boolean> => {
  await io();
  const [row] = await sql()<{ value: string }[]>`SELECT value FROM settings WHERE key = 'publish_unverified'`;
  return row?.value === "1";
});
