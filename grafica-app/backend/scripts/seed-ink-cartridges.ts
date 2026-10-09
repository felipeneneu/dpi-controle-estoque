import { eq, and } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { stockItems, machines, machineItems, cartuchos } from '../src/db/schema.js';
import { newId } from '../src/lib/ids.js';

/**
 * Konica AccurioPrint - Toner CMYK
 * Toner nao tem part number OEM no repositorio (decisao do operador).
 * code = NULL, monitorado apenas via telemetria (%).
 * Unidade: pct (porcentagem), capacidade = 100%.
 */
const KONICA_TONERS: { sku: string; label: string; color: string; channel: string }[] = [
  { sku: 'konica_toner-cyan', label: 'Cyan', color: 'Ciano', channel: 'C' },
  { sku: 'konica_toner-magenta', label: 'Magenta', color: 'Magenta', channel: 'M' },
  { sku: 'konica_toner-yellow', label: 'Yellow', color: 'Amarelo', channel: 'Y' },
  { sku: 'konica_toner-black', label: 'Black', color: 'Preto', channel: 'K' },
];

const CAPACITY_PCT = 100;
const MIN_PCT = 15; // alerta em 15%

async function run() {
  const konica = await db
    .select()
    .from(machines)
    .where(and(eq(machines.brand, 'Konica'), eq(machines.model, 'AccurioPrint C3070')))
    .get();

  if (!konica) {
    console.log('[seed-ink-cartridges] Máquina Konica AccurioPrint C3070 não encontrada. Cadastre-a primeiro.');
    process.exit(1);
  }

  let inserted = 0;
  let updated = 0;
  let cartuchosCreated = 0;

  for (const toner of KONICA_TONERS) {
    const existing = await db.select().from(stockItems).where(eq(stockItems.name, toner.sku)).all();

    let itemId: string;

    if (existing.length === 0) {
      itemId = newId();
      await db.insert(stockItems).values({
        id: itemId,
        name: toner.sku,
        code: null, // Toner nao tem codigo - monitorado, nao cadastrado
        category: 'INK_SUPPLY',
        subType: 'Toner Konica',
        unit: 'pct',
        width: null,
        currentQuantity: 0, // Saldo derivado dos cartuchos
        minQuantity: MIN_PCT,
        label: `Toner Konica ${toner.label} (${toner.channel})`,
        status: 'AVAILABLE',
      });
      inserted++;
    } else {
      itemId = existing[0]!.id;
      await db.update(stockItems)
        .set({
          code: null,
          currentQuantity: 0,
          minQuantity: MIN_PCT,
          label: `Toner Konica ${toner.label} (${toner.channel})`,
          status: 'AVAILABLE',
        })
        .where(eq(stockItems.id, itemId));
      updated++;
    }

    // Vincular à máquina Konica
    const link = await db
      .select()
      .from(machineItems)
      .where(and(eq(machineItems.machineId, konica.id), eq(machineItems.stockItemId, itemId)))
      .get();

    if (!link) {
      await db.insert(machineItems).values({
        id: newId(),
        machineId: konica.id,
        stockItemId: itemId,
      });
    }

    // Criar 1 cartucho por cor (em deposito)
    // O operador troca e o sistema avisa quando < 15% e sem estoque
    const existingCartuchos = await db
      .select()
      .from(cartuchos)
      .where(and(eq(cartuchos.stockItemId, itemId), eq(cartuchos.state, 'NEW')))
      .all();

    if (existingCartuchos.length === 0) {
      const cartuchoId = newId();
      const serial = `CTN-KONICA-${toner.channel}-01`;
      await db.insert(cartuchos).values({
        id: cartuchoId,
        stockItemId: itemId,
        serial,
        channel: toner.channel,
        unit: 'pct',
        levelInitial: CAPACITY_PCT,
        levelCurrent: CAPACITY_PCT,
        levelCapacity: CAPACITY_PCT,
        state: 'NEW',
        location: 'deposito',
        cartridgeCode: serial,
        telemetrySku: null,
        createdAt: Date.now(),
      });
      cartuchosCreated++;
    }
  }

  console.log(
    `[seed-ink-cartridges] ${inserted} toners criados, ${updated} atualizados, ${cartuchosCreated} cartuchos criados.`,
  );
}

void run()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error('[seed-ink-cartridges] erro:', err);
    process.exit(1);
  });