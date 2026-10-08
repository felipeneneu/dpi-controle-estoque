import { client } from '../src/db/index.js';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIR = fileURLToPath(new URL('../drizzle', import.meta.url));

async function main() {
  console.log('--- Alinhando Migrações e Índices ---');

  // 1. Garantir índices de 0014
  console.log('Garantindo índices da tabela ink_consumption_log...');
  await client.execute('CREATE INDEX IF NOT EXISTS ink_consumption_log_machine_idx ON ink_consumption_log (machine_id)');
  await client.execute('CREATE INDEX IF NOT EXISTS ink_consumption_log_channel_idx ON ink_consumption_log (channel)');
  await client.execute('CREATE INDEX IF NOT EXISTS ink_consumption_log_created_idx ON ink_consumption_log (created_at)');

  console.log('Garantindo índices da tabela tinta_lotes...');
  await client.execute('CREATE INDEX IF NOT EXISTS tinta_lotes_stock_item_idx ON tinta_lotes (stock_item_id)');
  await client.execute('CREATE INDEX IF NOT EXISTS tinta_lotes_state_idx ON tinta_lotes (state)');
  await client.execute('CREATE INDEX IF NOT EXISTS tinta_lotes_machine_idx ON tinta_lotes (machine_id)');
  await client.execute('CREATE INDEX IF NOT EXISTS tinta_lotes_channel_idx ON tinta_lotes (channel)');
  await client.execute(`CREATE UNIQUE INDEX IF NOT EXISTS tinta_lotes_active_channel_idx ON tinta_lotes (machine_id, channel) WHERE state = 'IN_USE'`);

  // 2. Verificar e registrar migrações no __drizzle_migrations
  const journalPath = `${MIGRATIONS_DIR}/meta/_journal.json`;
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'));

  const existingRes = await client.execute('SELECT hash FROM __drizzle_migrations');
  const existingHashes = new Set(existingRes.rows.map((r) => String(r.hash)));

  for (const entry of journal.entries) {
    const sqlPath = `${MIGRATIONS_DIR}/${entry.tag}.sql`;
    const sqlContent = readFileSync(sqlPath, 'utf8');
    const hash = createHash('sha256').update(sqlContent).digest('hex');

    if (!existingHashes.has(hash)) {
      console.log(`Registrando migração pendente: ${entry.tag} (hash: ${hash}, when: ${entry.when})`);
      await client.execute({
        sql: 'INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)',
        args: [hash, entry.when],
      });
      existingHashes.add(hash);
    } else {
      console.log(`Migração já registrada: ${entry.tag}`);
    }
  }

  console.log('✅ Migrações e índices alinhados com sucesso!');
}

main().catch((err) => {
  console.error('❌ Erro no alinhamento de migrações:', err);
  process.exit(1);
});
