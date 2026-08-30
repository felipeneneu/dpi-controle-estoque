import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { settings } from '../db/schema.js';

export async function getSetting(key: string): Promise<string | null> {
  const row = await db.query.settings.findFirst({
    where: eq(settings.key, key),
  });
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}
