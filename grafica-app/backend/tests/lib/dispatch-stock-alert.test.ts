import { describe, it, expect, beforeEach } from 'vitest';
import { ensureSchema, resetDb } from '../helpers/app.js';
import { db } from '../../src/db/index.js';
import { stockItems, notifications, users, type StockItem } from '../../src/db/schema.js';
import { dispatchStockAlert } from '../../src/lib/notification-resend.js';
import { newId } from '../../src/lib/ids.js';
import { eq } from 'drizzle-orm';

describe('dispatchStockAlert anti-spam and deduplication', () => {
  let item: StockItem;
  const actorId = 'system';

  beforeEach(async () => {
    await ensureSchema();
    await resetDb();

    // Ensure system user exists
    const existingSys = await db.select().from(users).where(eq(users.id, actorId)).get();
    if (!existingSys) {
      await db.insert(users).values({
        id: actorId,
        name: 'Sistema',
        email: 'system@grafica.local',
        passwordHash: 'none',
        role: 'OPERATOR',
      });
    }

    const testItem = {
      id: newId(),
      name: 'Vinil Adesivo Brilho',
      category: 'PAPER_MEDIA' as const,
      unit: 'm' as const,
      currentQuantity: 20,
      minQuantity: 10,
    };
    await db.insert(stockItems).values(testItem);
    item = (await db.select().from(stockItems).where(eq(stockItems.id, testItem.id)).get())!;
  });

  it('dispatches the first LOW_STOCK alert and creates a notification', async () => {
    const sent = await dispatchStockAlert({
      item,
      newQty: 8,
      status: 'LOW_STOCK',
      actorId,
    });

    expect(sent).toBe(true);

    const notifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.itemId, item.id))
      .all();

    expect(notifs).toHaveLength(1);
    expect(notifs[0].alertLevel).toBe('LOW_STOCK');
    expect(notifs[0].waMessage).toContain('Vinil Adesivo Brilho');
  });

  it('suppresses duplicate alert when item is already in LOW_STOCK and unacknowledged (Meta anti-spam)', async () => {
    // First alert
    const first = await dispatchStockAlert({
      item,
      newQty: 8,
      status: 'LOW_STOCK',
      actorId,
    });
    expect(first).toBe(true);

    // Second deduction for the same item still in LOW_STOCK
    const second = await dispatchStockAlert({
      item,
      newQty: 6,
      status: 'LOW_STOCK',
      actorId,
    });

    // Must be suppressed to prevent spam and Meta bans
    expect(second).toBe(false);

    // Only 1 notification should exist
    const notifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.itemId, item.id))
      .all();
    expect(notifs).toHaveLength(1);
  });

  it('allows new alert when status escalates from LOW_STOCK to OUT_OF_STOCK', async () => {
    // Initial LOW_STOCK alert
    await dispatchStockAlert({
      item,
      newQty: 5,
      status: 'LOW_STOCK',
      actorId,
    });

    // Quantity drops to 0 (OUT_OF_STOCK) -> status change / new warning
    const escalated = await dispatchStockAlert({
      item,
      newQty: 0,
      status: 'OUT_OF_STOCK',
      actorId,
    });

    expect(escalated).toBe(true);

    const notifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.itemId, item.id))
      .all();

    expect(notifs).toHaveLength(2);
    expect(notifs.some((n) => n.alertLevel === 'LOW_STOCK')).toBe(true);
    expect(notifs.some((n) => n.alertLevel === 'OUT_OF_STOCK')).toBe(true);
  });

  it('allows new LOW_STOCK alert after previous one is acknowledged', async () => {
    // Initial alert
    await dispatchStockAlert({
      item,
      newQty: 5,
      status: 'LOW_STOCK',
      actorId,
    });

    // Mark as acknowledged
    await db
      .update(notifications)
      .set({ acknowledgedAt: new Date() })
      .where(eq(notifications.itemId, item.id));

    // Next deduction -> allowed because previous was confirmed
    const nextAlert = await dispatchStockAlert({
      item,
      newQty: 3,
      status: 'LOW_STOCK',
      actorId,
    });

    expect(nextAlert).toBe(true);
  });
});
