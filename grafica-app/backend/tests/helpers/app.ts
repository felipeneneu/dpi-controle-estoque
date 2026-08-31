import { migrate } from 'drizzle-orm/libsql/migrator';
import { sql } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';
import { db } from '../../src/db/index.js';
import { buildApp } from '../../src/app.js';

export async function ensureSchema() {
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
  });
}

export async function resetDb() {
  // Order matters for FKs (children first). `users` is intentionally preserved so
  // that JWT `sub`s remain valid across tests within a file.
  const tables = [
    'machine_items',
    'stock_transactions',
    'notifications',
    'messages',
    'machine_items',
    'settings',
    'suppliers',
    'stock_items',
    'machines',
  ];
  for (const t of tables) {
    await db.run(sql`DELETE FROM ${sql.raw(`\`${t}\``)}`);
  }
}

export async function makeApp() {
  await ensureSchema();
  return buildApp({ logger: false });
}
