import { db } from '../src/db/index.js';
import { bobinas, stockItems } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

async function audit() {
  const allBobinas = await db.select({
    bobinaId: bobinas.id,
    serial: bobinas.serial,
    state: bobinas.state,
    stockItemId: stockItems.id,
    itemName: stockItems.name,
    category: stockItems.category,
    unit: stockItems.unit
  })
  .from(bobinas)
  .leftJoin(stockItems, eq(bobinas.stockItemId, stockItems.id))
  .all();

  console.log("=== AUDITORIA DE BOBINAS ===");
  console.log(JSON.stringify(allBobinas, null, 2));

  // Remove invalid bobinas
  const invalidBobinas = allBobinas.filter(b => b.category !== 'PAPER_MEDIA' || b.unit !== 'm');
  
  if (invalidBobinas.length > 0) {
    console.log(`\nEncontradas ${invalidBobinas.length} bobinas inválidas (não PAPER_MEDIA ou não 'm'). Removendo...`);
    for (const b of invalidBobinas) {
      await db.delete(bobinas).where(eq(bobinas.id, b.bobinaId));
      console.log(`- Deletada bobina ${b.serial} (${b.itemName} - ${b.category})`);
    }
  } else {
    console.log("\nNenhuma bobina inválida encontrada.");
  }
}

audit().catch(console.error);
