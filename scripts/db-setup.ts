// Creates/updates the tables and, if there is no admin yet, the first admin user:
//   ADMIN_EMAIL=... ADMIN_NAME=... ADMIN_PASSWORD=... npm run db:setup   (or put them in .env.local)
import nextEnv from "@next/env";
import postgres from "postgres";
import { hashPassword, MIN_PASSWORD_LENGTH } from "../src/lib/password.ts";
import { SCHEMA_SQL } from "../src/lib/schema.ts";

// Same .env loader as Next, so "$" escaping (\$) in passwords is read identically by both
nextEnv.loadEnvConfig(process.cwd());

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL en .env.local");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
try {
  await sql.unsafe(SCHEMA_SQL);
  const [{ n }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM users WHERE role = 'admin' AND status = 'active'`;
  if (n > 0) {
    console.log(`Tablas al día. Ya hay ${n} administrador(es).`);
  } else {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password || password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`No hay administrador: define ADMIN_EMAIL y ADMIN_PASSWORD (mín. ${MIN_PASSWORD_LENGTH} caracteres) y vuelve a ejecutar`);
    }
    await sql`
      INSERT INTO users (name, email, role, status, password_hash)
      VALUES (${process.env.ADMIN_NAME?.trim() || email.split("@")[0]}, ${email}, 'admin', 'active', ${await hashPassword(password)})
      ON CONFLICT (email) DO UPDATE SET role = 'admin', status = 'active', password_hash = EXCLUDED.password_hash`;
    console.log(`Administrador creado: ${email}`);
  }
} catch (e) {
  console.error("Error preparando la base de datos:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await sql.end();
}
