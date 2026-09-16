import { db } from '../src/db/index.js';
import { stockItems, bobinas, garrafas, stockTransactions, notifications, users } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { newId } from '../src/lib/ids.js';

async function adjustStockWithSafetyMargin() {
  console.log('Iniciando ajuste de estoque com margem de segurança (+20%)...');

  const items = await db.select().from(stockItems).all();
  const allBobinas = await db.select().from(bobinas).all();
  const allGarrafas = await db.select().from(garrafas).all();
  const systemUser = await db.select().from(users).limit(1).get();
  const userId = systemUser?.id || null;
  const userName = systemUser?.name || 'Sistema';

  let adjustedCount = 0;
  const adjustmentsLog = [];

  for (const item of items) {
    let effectiveQty = item.currentQuantity;
    if (item.category === 'PAPER_MEDIA' && item.unit === 'm') {
      const bList = allBobinas.filter(b => b.stockItemId === item.id && (b.state === 'NEW' || b.state === 'IN_USE'));
      effectiveQty = bList.reduce((sum, b) => sum + (b.metersRemaining || 0), 0);
    } else if (item.category === 'INK_SUPPLY') {
      const gList = allGarrafas.filter(g => g.stockItemId === item.id && (g.state === 'NEW' || g.state === 'IN_USE'));
      if (gList.length > 0) {
        effectiveQty = gList.reduce((sum, g) => sum + (g.mlRemaining || 0), 0);
      }
    }

    if (effectiveQty < item.minQuantity) {
      // Calcula meta com +20% de margem
      const targetQty = Math.ceil(item.minQuantity * 1.2);
      const diff = Math.max(0, targetQty - effectiveQty);

      if (diff <= 0) continue;

      if (item.category === 'PAPER_MEDIA' && item.unit === 'm') {
        const shortIdStr = Math.floor(1000 + Math.random() * 9000).toString();
        const serial = `BOB-${shortIdStr}`;
        await db.insert(bobinas).values({
          id: newId(),
          stockItemId: item.id,
          serial,
          widthMm: item.width || 1000,
          metersInitial: diff,
          metersRemaining: diff,
          state: 'NEW',
          location: 'deposito',
        });
      } else if (item.category === 'INK_SUPPLY') {
        const shortIdStr = Math.floor(1000 + Math.random() * 9000).toString();
        const serial = `TIN-${shortIdStr}`;
        await db.insert(garrafas).values({
          id: newId(),
          stockItemId: item.id,
          serial,
          mlInitial: diff,
          mlRemaining: diff,
          state: 'NEW',
          location: 'deposito',
        });
      }

      // Atualiza item no banco
      await db
        .update(stockItems)
        .set({
          currentQuantity: targetQty,
          status: 'AVAILABLE',
        })
        .where(eq(stockItems.id, item.id));

      // Registra transação de estoque
      await db.insert(stockTransactions).values({
        id: newId(),
        itemId: item.id,
        type: 'ADJUSTMENT',
        quantity: diff,
        reason: `Ajuste de Estoque (+20% margem de segurança: min ${item.minQuantity} -> meta ${targetQty})`,
        userId: userId,
        userName: userName,
      });

      // Baixa alertas e notificações antigas do item
      try {
        await db
          .update(notifications)
          .set({
            read: true,
            acknowledgedAt: new Date(),
          })
          .where(eq(notifications.itemId, item.id));
      } catch (_) {}

      adjustedCount++;
      adjustmentsLog.push({
        name: item.name,
        category: item.category,
        unit: item.unit,
        anterior: effectiveQty,
        minimo: item.minQuantity,
        novoSaldo: targetQty,
        adicionado: diff,
      });
    }
  }

  console.log(`\nSucesso: ${adjustedCount} produtos foram ajustados.`);
  console.table(adjustmentsLog);
}

adjustStockWithSafetyMargin().catch(console.error);
