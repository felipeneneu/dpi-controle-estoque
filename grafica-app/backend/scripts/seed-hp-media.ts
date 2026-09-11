import { eq, and } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { stockItems, machines, machineItems } from '../src/db/schema.js';
import { newId } from '../src/lib/ids.js';

interface MediaSeed {
  nome: string; // nome que DEVE conter o mediaType real da impressora (ex: 'starflex 280g')
  width: number;
}

// mediaType real detectado na impressora é 'starflex 280g' (1,057 mm ~ 1,06 m).
// O stock-deductor dá match por nome.includes(job.mediaType), então o nome precisa conter 'starflex 280g'.
const MIDIAS: MediaSeed[] = [
  { nome: 'STARFLEX 280G 1,06 Mts.', width: 1.06 },
];

const DEFAULT_QTY_M = 50;
const DEFAULT_MIN_M = 10;

async function run() {
  const hp = await db
    .select()
    .from(machines)
    .where(and(eq(machines.brand, 'HP'), eq(machines.model, 'Latex 330')))
    .get();

  if (!hp) {
    console.log('[seed-hp-media] Máquina HP Latex 330 não encontrada.');
    process.exit(1);
  }

  let inserted = 0;
  let skipped = 0;
  let linked = 0;

  for (const m of MIDIAS) {
    const name = m.nome;
    const existing = await db.select().from(stockItems).where(eq(stockItems.name, name)).all();

    if (existing.length === 0) {
      await db.insert(stockItems).values({
        id: newId(),
        name,
        category: 'PAPER_MEDIA',
        subType: 'Bobina',
        unit: 'm',
        width: m.width,
        currentQuantity: DEFAULT_QTY_M,
        minQuantity: DEFAULT_MIN_M,
        status: 'AVAILABLE',
      });
      inserted++;
    } else {
      skipped++;
    }

    const rows = await db.select().from(stockItems).where(eq(stockItems.name, name)).all();
    const item = rows[0]!;

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
      linked++;
    }
  }

  console.log(
    `[seed-hp-media] ${inserted} mídias criadas, ${skipped} já existentes, ${linked} vínculos com HP adicionados.`,
  );
}

void run()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error('[seed-hp-media] erro:', err);
    process.exit(1);
  });
