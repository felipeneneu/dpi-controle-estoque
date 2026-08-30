import { createClient as createLibsqlClient } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from './schema.js';

const url = process.env.TURSO_DATABASE_URL || 'file:./local-replica.db';
const authToken = process.env.TURSO_AUTH_TOKEN;

const client = createLibsqlClient({ url, authToken });

export const db: LibSQLDatabase<typeof schema> = drizzle(client, { schema });

export { schema };
