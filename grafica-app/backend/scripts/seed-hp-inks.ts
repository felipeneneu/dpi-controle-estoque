import { eq, and } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { stockItems, machines, machineItems } from '../src/db/schema.js';
import { newId } from '../src/lib/ids.js';

const HP_INKS: { sku: string; label: string; color: string }[] = [
  { sku: 'hp_tinta-cyan', label: 'Cyan', color: 'Cyan' },
  { sku: 'hp_tinta-light-cyan', label: 'Light Cyan', color: 'Light Cyan' },
  { sku: 'hp_tinta-magenta', label: 'Magenta', color: 'Magenta' },
  { sku: 'hp_tinta-light-magenta', label: 'Light Magenta', color: 'Light Magenta' },
  { sku: 'hp_tinta-yellow', label: 'Yellow', color: 'Yellow' },
  { sku: 'hp_tinta-black', label: 'Black', color: 'Black' },
  { sku: 'hp_tinta-optimizer', label: 'Latex Optimizer', color: 'Optimizer' },
];

const CAPACITY_ML = 775;
const SIMULATED_CARTRIDGES = 2;
const INITIAL_ML = CAPACITY_ML * SIMULATED_CARTRIDGES;
const MIN_ML = CAPACITY_ML; // alerta quando cair abaixo de 1 cartucho

async function run() {
  const hp = await db
    .select()
    .from(machines)
    .where(and(eq(machines.brand, 'HP'), eq(machines.model, 'Latex 330')))
    .get();

  if (!hp) {
    console.log('[seed-hp-inks] Máquina HP Latex 330 não encontrada. Cadastre-a primeiro.');
    process.exit(1);
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const ink of HP_INKS) {
    const existing = await db.select().from(stockItems).where(eq(stockItems.name, ink.sku)).all();

    if (existing.length === 0) {
      await db.insert(stockItems).values({
        id: newId(),
        name: ink.sku,
        category: 'INK_SUPPLY',
        subType: 'Cartucho',
        unit: 'ml',
        currentQuantity: INITIAL_ML,
        minQuantity: MIN_ML,
        label: `HP 831 ${ink.label} (simulado ${SIMULATED_CARTRIDGES} cartuchos)`,
        status: 'AVAILABLE',
      });
      inserted++;
    } else {
      const item = existing[0]!;
      await db.update(stockItems)
        .set({
          currentQuantity: INITIAL_ML,
          minQuantity: MIN_ML,
          label: `HP 831 ${ink.label} (simulado ${SIMULATED_CARTRIDGES} cartuchos)`,
          status: 'AVAILABLE',
        })
        .where(eq(stockItems.id, item.id));
      updated++;
    }

    const itemRows = await db.select().from(stockItems).where(eq(stockItems.name, ink.sku)).all();
    const item = itemRows[0]!;

    const link = await db
      .select()
      .from(machineItems)
      .where(and(eq(machineItems.machineId, hp.id), eq(machineItems.stockItemId, item.id)))
      .get();

    if (!link) {
      await db.insert(machineItems).values({
        id: newId(),
        machineId: hp.id,
        stockItemId: item.id,
      });
      skipped++;
    }
  }

  console.log(
    `[seed-hp-inks] ${inserted} tintas criadas, ${updated} atualizadas, ${skipped} vínculos com HP adicionados.`,
  );
}

void run()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error('[seed-hp-inks] erro:', err);
    process.exit(1);
  });
