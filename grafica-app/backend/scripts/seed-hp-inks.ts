import { eq, and } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { stockItems, machines, machineItems, cartuchos } from '../src/db/schema.js';
import { newId } from '../src/lib/ids.js';

/**
 * HP Latex 330 - Part numbers reais (CZ###A)
 * Cada tinta tem 775 ml de capacidade nominal.
 */
const HP_INKS: { sku: string; code: string; label: string; color: string; channel: string }[] = [
  { sku: 'hp_tinta-black', code: 'CZ682A', label: 'Black', color: 'Preto', channel: 'K' },
  { sku: 'hp_tinta-cyan', code: 'CZ683A', label: 'Cyan', color: 'Ciano', channel: 'C' },
  { sku: 'hp_tinta-magenta', code: 'CZ684A', label: 'Magenta', color: 'Magenta', channel: 'M' },
  { sku: 'hp_tinta-yellow', code: 'CZ685A', label: 'Yellow', color: 'Amarelo', channel: 'Y' },
  { sku: 'hp_tinta-light-cyan', code: 'CZ686A', label: 'Light Cyan', color: 'Ciano Claro', channel: 'LC' },
  { sku: 'hp_tinta-light-magenta', code: 'CZ687A', label: 'Light Magenta', color: 'Magenta Claro', channel: 'LM' },
  { sku: 'hp_tinta-optimizer', code: 'CZ706A', label: 'Latex Optimizer', color: 'Otimizador', channel: 'OP' },
];

const CAPACITY_ML = 775;
const CARTRIDGES_PER_COLOR = 2; // 2 cartuchos por cor em estoque inicial
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
  let cartuchosCreated = 0;

  for (const ink of HP_INKS) {
    const existing = await db.select().from(stockItems).where(eq(stockItems.name, ink.sku)).all();

    let itemId: string;

    if (existing.length === 0) {
      itemId = newId();
      await db.insert(stockItems).values({
        id: itemId,
        name: ink.sku,
        code: ink.code,
        category: 'INK_SUPPLY',
        subType: 'Cartucho HP Latex 831',
        unit: 'ml',
        width: null,
        currentQuantity: 0, // Saldo derivado dos cartuchos (BR-052)
        minQuantity: MIN_ML,
        label: `HP 831 ${ink.label} (${ink.code}) - ${CAPACITY_ML}ml`,
        status: 'AVAILABLE',
      });
      inserted++;
    } else {
      itemId = existing[0]!.id;
      await db.update(stockItems)
        .set({
          code: ink.code,
          currentQuantity: 0, // Saldo derivado dos cartuchos
          minQuantity: MIN_ML,
          label: `HP 831 ${ink.label} (${ink.code}) - ${CAPACITY_ML}ml`,
          status: 'AVAILABLE',
        })
        .where(eq(stockItems.id, itemId));
      updated++;
    }

    // Vincular à máquina HP
    const link = await db
      .select()
      .from(machineItems)
      .where(and(eq(machineItems.machineId, hp.id), eq(machineItems.stockItemId, itemId)))
      .get();

    if (!link) {
      await db.insert(machineItems).values({
        id: newId(),
        machineId: hp.id,
        stockItemId: itemId,
      });
    }

    // Criar cartuchos (NOVOS em deposito) - BR-052
    const existingCartuchos = await db
      .select()
      .from(cartuchos)
      .where(and(eq(cartuchos.stockItemId, itemId), eq(cartuchos.state, 'NEW')))
      .all();

    if (existingCartuchos.length === 0) {
      for (let i = 1; i <= CARTRIDGES_PER_COLOR; i++) {
        const cartuchoId = newId();
        const serial = `CTN-${ink.code}-${String(i).padStart(2, '0')}`;
        await db.insert(cartuchos).values({
          id: cartuchoId,
          stockItemId: itemId,
          serial,
          channel: ink.channel,
          unit: 'ml',
          levelInitial: CAPACITY_ML,
          levelCurrent: CAPACITY_ML,
          levelCapacity: CAPACITY_ML,
          state: 'NEW',
          location: 'deposito',
          cartridgeCode: serial,
          telemetrySku: ink.code,
          createdAt: Date.now(),
        });
        cartuchosCreated++;
      }
    }
  }

  console.log(
    `[seed-hp-inks] ${inserted} tintas criadas, ${updated} atualizadas, ${cartuchosCreated} cartuchos criados.`,
  );
}

void run()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error('[seed-hp-inks] erro:', err);
    process.exit(1);
  });