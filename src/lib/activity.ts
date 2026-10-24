import { sql } from "./db";

// Feed for "Últimos cambios" on the dashboard. Never let logging break the action that triggered it.
export async function logActivity(text: string) {
  try {
    await sql()`INSERT INTO activity (text) VALUES (${text.slice(0, 300)})`;
  } catch (e) {
    console.error("logActivity failed", e);
  }
}
