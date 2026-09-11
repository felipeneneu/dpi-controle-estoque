import { eq, and } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { stockItems, machines, machineItems } from '../src/db/schema.js';
import { newId } from '../src/lib/ids.js';

interface LonaSeed {
  nome: string;      // nome do produto (ex: 'LONA 440G')
  acabamento: string; // 'Brilho' | 'Fosca' | 'Blacklight Fosca'
  width: number;
}

const LONAS: LonaSeed[] = [
  // LONA 280G BRILHO
  { nome: 'LONA 280G', acabamento: 'Brilho', width: 0.6 },
  { nome: 'LONA 280G', acabamento: 'Brilho', width: 1.0 },
  { nome: 'LONA 280G', acabamento: 'Brilho', width: 1.06 },
  { nome: 'LONA 280G', acabamento: 'Brilho', width: 1.6 }, // UM ROLO NO ESTOQUE

  // LONA 440G BRILHO
  { nome: 'LONA 440G', acabamento: 'Brilho', width: 0.6 },
  { nome: 'LONA 440G', acabamento: 'Brilho', width: 1.0 },
  { nome: 'LONA 440G', acabamento: 'Brilho', width: 1.2 },
  { nome: 'LONA 440G', acabamento: 'Brilho', width: 1.4 },
  { nome: 'LONA 440G', acabamento: 'Brilho', width: 1.6 },

  // LONA 440G FOSCA (0,48 + 1,08 = composição p/ 1,60; registrados como larguras próprias + 1,60)
  { nome: 'LONA 440G', acabamento: 'Fosca', width: 0.48 },
  { nome: 'LONA 440G', acabamento: 'Fosca', width: 1.08 },
  { nome: 'LONA 440G', acabamento: 'Fosca', width: 1.6 },

  // LONA BLACKLIGHT FOSCA
  { nome: 'LONA BLACKLIGHT', acabamento: 'Fosca', width: 1.6 },
];

const DEFAULT_QTY_M = 50;
const DEFAULT_MIN_M = 10;

function fmtWidth(w: number): string {
  return w.toFixed(2).replace('.', ',');
}

function buildName(l: LonaSeed): string {
  return `${l.nome} ${l.acabamento.toUpperCase()} ${fmtWidth(l.width)} Mts.`;
}

async function run() {
  const hp = await db
    .select()
    .from(machines)
    .where(and(eq(machines.brand, 'HP'), eq(machines.model, 'Latex 330')))
    .get();

  if (!hp) {
    console.log('[seed-hp-lonas] Máquina HP Latex 330 não encontrada. Cadastre-a primeiro.');
    process.exit(1);
  }

  let inserted = 0;
  let skipped = 0;
  let linked = 0;

  for (const l of LONAS) {
    const name = buildName(l);
    const existing = await db.select().from(stockItems).where(eq(stockItems.name, name)).all();

    if (existing.length === 0) {
      await db.insert(stockItems).values({
        id: newId(),
        name,
        category: 'PAPER_MEDIA',
        subType: 'Bobina',
        unit: 'm',
        width: l.width,
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
    `[seed-hp-lonas] ${inserted} lonas criadas, ${skipped} já existentes, ${linked} vínculos com HP adicionados.`,
  );
}

void run()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error('[seed-hp-lonas] erro:', err);
    process.exit(1);
  });
