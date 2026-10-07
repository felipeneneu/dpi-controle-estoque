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
    'ink_consumption_log',
    'tinta_lotes',
    'cartucho_consumo',
    'cartuchos',
    // Filhos de `stock_items`/`machines` antes deles. `mimaki_jobs` referencia
    // `machines`, `stock_items` e `users`: sem ele aqui, o DELETE de `machines`
    // estoura FK em qualquer teste que semeie job Mimaki.
    'mimaki_test_jobs',
    'mimaki_jobs',
    // `bobinas` e `garrafas` tambem referenciam `stock_items`.
    'bobinas',
    'garrafas',
    'machine_items',
    'stock_transactions',
    'notifications',
    'whatsapp_recipients',
    'messages',
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
