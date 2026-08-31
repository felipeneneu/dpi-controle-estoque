import { migrate } from 'drizzle-orm/libsql/migrator';
import { db } from './db/index.js';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { Seed } from './seed.js';
import { startWhatsApp, stopWhatsApp } from './lib/whatsapp.js';

const port = Number(process.env.PORT || 3001);

await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });

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

process.on('SIGINT', () => {
  stopWhatsApp();
  process.exit(0);
});
process.on('SIGTERM', () => {
  stopWhatsApp();
  process.exit(0);
});
