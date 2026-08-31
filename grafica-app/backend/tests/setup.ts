import { beforeEach } from 'vitest';
import { ensureSchema, resetDb } from './helpers/app.js';

process.env.TURSO_DATABASE_URL = ':memory:';
process.env.JWT_SECRET = 'test_secret_for_unit_tests_0123456789';
process.env.GRAFICA_DISABLE_WHATSAPP = '1';
Object.assign(process.env, { NODE_ENV: 'test' });

await ensureSchema();

beforeEach(async () => {
  await resetDb();
});
