import { migrate } from 'drizzle-orm/libsql/migrator';
import { db, client } from './db/index.js';
import { sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { Seed } from './seed.js';
import { startWhatsApp, stopWhatsApp } from './lib/whatsapp.js';
import { startAlertEscalation, stopAlertEscalation } from './lib/notification-resend.js';
import { startDiscovery } from './discovery.js';
import { startHpAgent } from './agents/hp-latex/index.js';
import { startKonicaAgent } from './agents/konica/index.js';
import { startBrain } from './agents/brain/index.js';
import { setupSchedulers } from './lib/scheduler.js';

const port = Number(process.env.PORT || 3001);

const MIGRATIONS_DIR = fileURLToPath(new URL('../drizzle', import.meta.url));

async function ensureMachineTelemetryTable() {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS machine_telemetry (
      id text PRIMARY KEY NOT NULL,
      machine_id text NOT NULL,
      online integer DEFAULT false NOT NULL,
      status_severity text,
      status_message text,
      media_name text,
      media_width_mm real,
      ink_cyan_ml real,
      ink_light_cyan_ml real,
      ink_magenta_ml real,
      ink_light_magenta_ml real,
      ink_yellow_ml real,
      ink_black_ml real,
      ink_optimizer_ml real,
      ink_capacity_ml real,
      maintenance_cartridge_pct real,
      kit_1_pct real,
      kit_2_pct real,
      kit_3_pct real,
      drying_temp_c real,
      curing_temp_c real,
      created_at integer,
      FOREIGN KEY (machine_id) REFERENCES machines(id) ON UPDATE no action ON DELETE cascade
    )
  `);
  await client.execute(`CREATE INDEX IF NOT EXISTS machine_telemetry_machine_idx ON machine_telemetry (machine_id)`);
}

try {
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
} catch (err: unknown) {
  console.warn('[migration] Erro na migração. Aplicando correções manualmente...', err);

    await ensureMachineTelemetryTable();

    const safeAddCol = async (table: string, col: string, type: string) => {
      try {
        await client.execute(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
        console.warn(`[migration] Adicionada coluna ${table}.${col}`);
      } catch (e: unknown) {
        const m = e instanceof Error ? e.message : '';
        if (!m.includes('duplicate column name')) throw e;
      }
    };

    const safeCreateIdx = async (name: string, table: string, col: string) => {
      try {
        await client.execute(`CREATE INDEX IF NOT EXISTS ${name} ON ${table} (${col})`);
      } catch { /* ignore */ }
    };

    await safeAddCol('messages', 'recipient_id', 'text');
    await safeCreateIdx('chat_messages_recipient_idx', 'messages', 'recipient_id');

    await safeAddCol('machine_telemetry', 'toner_cyan_pct', 'real');
    await safeAddCol('machine_telemetry', 'toner_magenta_pct', 'real');
    await safeAddCol('machine_telemetry', 'toner_yellow_pct', 'real');
    await safeAddCol('machine_telemetry', 'toner_black_pct', 'real');
    await safeAddCol('machine_telemetry', 'waste_toner_level', 'text');
    await safeAddCol('machine_telemetry', 'trays_json', 'text');

    await safeAddCol('print_jobs', 'os_number', 'text');
    await safeAddCol('print_jobs', 'color_mode', 'text');
    await safeAddCol('mimaki_jobs', 'stock_deducted', 'integer');
    await safeAddCol('mimaki_jobs', 'copy_number', 'integer');
    await safeAddCol('mimaki_jobs', 'total_print', 'integer');
    await safeAddCol('mimaki_jobs', 'pass_count', 'integer');
    await safeAddCol('mimaki_jobs', 'resolution_dpi', 'integer');
    await safeAddCol('mimaki_jobs', 'print_direction', 'text');
    await safeAddCol('stock_transactions', 'user_name', 'text');

    await safeAddCol('print_jobs', 'roll_width_used', 'real');
    await safeAddCol('print_jobs', 'linear_meters_debited', 'real');
    await safeAddCol('print_jobs', 'hidden', 'integer DEFAULT false');

    const hashes = await db.all<{ hash: string }>(sql`SELECT hash FROM __drizzle_migrations`);
    const existing = new Set(hashes.map((h) => h.hash));
    const migrationFiles = [
      '0001_white_silver_centurion',
      '0002_lame_korg',
      '0003_dapper_jazinda',
      '0004_watery_owl',
      '0005_repair_machine_telemetry',
      '0006_grey_tomorrow_man',
      '0007_sticky_the_renegades',
      '0008_melodic_lorna_dane',
    ];
    for (const tag of migrationFiles) {
      const path = `${MIGRATIONS_DIR}/${tag}.sql`;
      try {
        const raw = readFileSync(path, 'utf8');
        const hash = createHash('sha256').update(raw).digest('hex');
        if (!existing.has(hash)) {
          await db.run(
            sql`INSERT INTO __drizzle_migrations (hash, created_at) VALUES (${hash}, ${Date.now()})`
          );
        }
      } catch { /* ignore missing files */ }
    }
    console.warn('[migration] Colunas verificadas/adicionadas. Tentando migrate() novamente...');
    try {
      await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    } catch (err2: unknown) {
      const msg = err2 instanceof Error ? err2.message : String(err2);
      // Accept "already exists" / "duplicate column" errors — schema is already up to date
      if (
        msg.includes('already exists') ||
        msg.includes('duplicate column name') ||
        msg.includes('table') && msg.includes('already')
      ) {
        console.warn('[migration] Schema já está atualizado, ignorando erro:', msg);
      } else {
        throw err2;
      }
    }
}

await client.execute({
  sql: `INSERT OR IGNORE INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)`,
  args: ['system', 'GraficaOS Bot', 'bot@grafica.local', '__system__', 'OPERATOR'],
});

await client.execute({
  sql: `INSERT OR IGNORE INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)`,
  args: ['konica-agent-system', 'Konica Agent', 'konica-agent@grafica.local', '__system__', 'OPERATOR'],
});

await client.execute({
  sql: `INSERT OR IGNORE INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)`,
  args: ['hp-agent-system', 'HP Latex Agent', 'hp-agent@grafica.local', '__system__', 'OPERATOR'],
});

const app = await buildApp({ logger: true });

if (process.env.SEED === 'true') {
  await Seed();
}

try {
  await app.listen({ port, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

startWhatsApp();
startAlertEscalation();
const stopDiscovery = startDiscovery(port);
const stopHpAgent = startHpAgent(app.io);
const stopKonicaAgent = startKonicaAgent(app.io);
setupSchedulers(app);
startBrain(app.io);

process.on('SIGINT', () => {
  stopHpAgent();
  stopKonicaAgent();
  stopDiscovery();
  stopWhatsApp();
  stopAlertEscalation();
  process.exit(0);
});
process.on('SIGTERM', () => {
  stopHpAgent();
  stopKonicaAgent();
  stopDiscovery();
  stopWhatsApp();
  stopAlertEscalation();
  process.exit(0);
});
