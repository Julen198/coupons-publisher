// "Avísame antes de cada fecha": the readers subscribed (date_alert_subs) and what was already sent to whom
// (date_alert_sends). Code ahead of its migration: the reader-facing calls treat missing tables as "not subscribed".
import { sql } from "./db";
import { isMissingSchema } from "./schema-guard.ts";

function logMissing(where: string, e: unknown) {
  console.error(`[date-alerts] ${where}: date_alert tables missing, run SCHEMA_SQL`, e);
}

export async function hasDateAlert(readerId: number): Promise<boolean> {
  try {
    const rows = await sql()`SELECT 1 FROM date_alert_subs WHERE reader_id = ${readerId}`;
    return rows.length > 0;
  } catch (e) {
    if (!isMissingSchema(e)) throw e;
    logMissing("hasDateAlert", e);
    return false;
  }
}

// `on` is the state asked for, so a double click can't flip it back. False when the tables don't exist yet.
export async function setDateAlert(readerId: number, on: boolean): Promise<boolean> {
  try {
    if (on) await sql()`INSERT INTO date_alert_subs (reader_id) VALUES (${readerId}) ON CONFLICT DO NOTHING`;
    else await sql()`DELETE FROM date_alert_subs WHERE reader_id = ${readerId}`;
    return true;
  } catch (e) {
    if (!isMissingSchema(e)) throw e;
    logMissing("setDateAlert", e);
    return false;
  }
}

// The cron's calls let a missing table throw: the route answers 503 (isMissingSchema)
export async function dueSubscribers(key: string): Promise<{ id: number; email: string }[]> {
  return (await sql()<{ id: number; email: string }[]>`
    SELECT r.id, r.email FROM date_alert_subs s JOIN readers r ON r.id = s.reader_id
    WHERE r.status = 'active'
      AND NOT EXISTS (SELECT 1 FROM date_alert_sends d WHERE d.reader_id = r.id AND d.event_key = ${key})
    ORDER BY r.id`).map((r) => ({ ...r }));
}

// Claim before sending: two overlapping cron runs can't both email the same reader for the same date
export async function claimSend(readerId: number, key: string): Promise<boolean> {
  const rows = await sql()`
    INSERT INTO date_alert_sends (reader_id, event_key) VALUES (${readerId}, ${key})
    ON CONFLICT DO NOTHING RETURNING reader_id`;
  return rows.length > 0;
}

// A send that failed gives its claim back, so a rerun the same day can try again
export async function releaseSend(readerId: number, key: string): Promise<void> {
  await sql()`DELETE FROM date_alert_sends WHERE reader_id = ${readerId} AND event_key = ${key}`;
}
