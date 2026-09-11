import { eq, and } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { stockItems, machines, machineItems } from '../src/db/schema.js';
import { newId } from '../src/lib/ids.js';

const KONICA_MODEL = 'C4065';

interface PaperSeed {
  nome: string; // nome com tokens de material/tamanho (sulfite a4, couche 33x48 250g, vinil...) p/ o stock-deductor
  unit: 'fls';
  qty: number; // em folhas (inteiro) — 1 resma = 500 folhas
  min: number; // em folhas (inteiro)
}

// Materiais reais da AccurioPrint C4065. Todos 33x48cm, EXCETO o Sulfite A4.
// Unidade SEMPRE em folhas (fls), inteira — débito = páginas impressas, sem casas decimais.
// Quantidades abaixo são estoques iniciais de referência (ajustáveis no cadastro).
const PAPERS: PaperSeed[] = [
  { nome: 'Papel Sulfite A4 75g', unit: 'fls', qty: 10000, min: 2500 },
  { nome: 'Papel Sulfite 33x48 75g', unit: 'fls', qty: 5000, min: 1500 },
  { nome: 'Papel Sulfite 33x48 120g', unit: 'fls', qty: 2500, min: 1000 },
  { nome: 'Papel Sulfite 33x48 180g', unit: 'fls', qty: 2500, min: 1000 },
  { nome: 'Couché 33x48 115g', unit: 'fls', qty: 8000, min: 2000 },
  { nome: 'Couché 33x48 150g', unit: 'fls', qty: 4000, min: 1000 },
  { nome: 'Couché 33x48 250g', unit: 'fls', qty: 2500, min: 800 },
  { nome: 'Adesivo Couché 33x48', unit: 'fls', qty: 2000, min: 500 },
  { nome: 'Vinil Branco 33x48', unit: 'fls', qty: 500, min: 100 },
  { nome: 'Vinil Fosco 33x48', unit: 'fls', qty: 500, min: 100 },
  { nome: 'Vinil Transparente 33x48', unit: 'fls', qty: 500, min: 100 },
  { nome: 'Reciclado 33x48 120g', unit: 'fls', qty: 1000, min: 300 },
  { nome: 'Reciclado 33x48 250g', unit: 'fls', qty: 1000, min: 300 },
  { nome: 'Kraft 33x48 250g', unit: 'fls', qty: 2000, min: 500 },
];

const TONERS: { sku: string; label: string }[] = [
  { sku: 'konica_toner-cyan', label: `Toner Ciano ${KONICA_MODEL}` },
  { sku: 'konica_toner-magenta', label: `Toner Magenta ${KONICA_MODEL}` },
  { sku: 'konica_toner-yellow', label: `Toner Amarelo ${KONICA_MODEL}` },
  { sku: 'konica_toner-black', label: `Toner Preto ${KONICA_MODEL}` },
];

async function run() {
  const konica = await db
    .select()
    .from(machines)
    .where(and(eq(machines.brand, 'Konica Minolta'), eq(machines.model, KONICA_MODEL)))
    .get();

  if (!konica) {
    console.log(`[seed-konica] Máquina Konica Minolta ${KONICA_MODEL} não encontrada.`);
    process.exit(1);
  }

  if (!konica.ip) {
    await db.update(machines).set({ ip: KONICA_IP }).where(eq(machines.id, konica.id));
    console.log(`[seed-konica] IP da Konica definido: ${KONICA_IP}`);
  } else {
    console.log(`[seed-konica] IP já cadastrado: ${konica.ip}`);
  }

  // Remove itens antigos do seed anterior (nomes sem tokens de classe/tamanho)
  // que não teriam match com o deductor e duplicariam o inventário.
  const OLD_NAMES = Object.freeze([
    'Papel A4 75g',
    'Papel A3 75g',
    'Papel Couché 90g A3',
  ]);
  for (const oldName of OLD_NAMES) {
    const olds = await db.select().from(stockItems).where(eq(stockItems.name, oldName)).all();
    for (const old of olds) {
      const links = await db
        .select()
        .from(machineItems)
        .where(eq(machineItems.stockItemId, old.id))
        .all();
      for (const link of links) {
        await db.delete(machineItems).where(eq(machineItems.id, link.id));
      }
      await db.delete(stockItems).where(eq(stockItems.id, old.id));
      console.log(`[seed-konica] Item antigo removido: ${oldName}`);
    }
  }

  let inserted = 0;
  let skipped = 0;
  let linked = 0;

  const upsert = async (name: string, values: Parameters<typeof db.insert>[0]['values'], category: 'PAPER_MEDIA' | 'INK_SUPPLY') => {
    const existing = await db.select().from(stockItems).where(eq(stockItems.name, name)).all();

    let itemId: string;
    if (existing.length === 0) {
      await db.insert(stockItems).values({
        id: newId(),
        name,
        category,
        ...values,
      });
      inserted++;
      const rows = await db.select().from(stockItems).where(eq(stockItems.name, name)).all();
      itemId = rows[0]!.id;
    } else {
      itemId = existing[0]!.id;
      skipped++;
    }

    const link = await db
      .select()
      .from(machineItems)
      .where(and(eq(machineItems.machineId, konica!.id), eq(machineItems.stockItemId, itemId)))
      .get();

    if (!link) {
      await db.insert(machineItems).values({
        id: newId(),
        machineId: konica!.id,
        stockItemId: itemId,
      });
      linked++;
    }
  };

  for (const p of PAPERS) {
    await upsert(
      p.nome,
      {
        subType: 'Papel',
        unit: p.unit,
        currentQuantity: p.qty,
        minQuantity: p.min,
        status: 'AVAILABLE',
      },
      'PAPER_MEDIA',
    );
  }

  for (const t of TONERS) {
    await upsert(
      t.sku,
      {
        subType: 'Cartucho',
        unit: 'un',
        currentQuantity: 1,
        minQuantity: 1,
        label: t.label,
        status: 'AVAILABLE',
      },
      'INK_SUPPLY',
    );
  }

  console.log(
    `[seed-konica] ${inserted} itens criados, ${skipped} já existentes, ${linked} vínculos com Konica adicionados.`,
  );
}

void run()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error('[seed-konica] erro:', err);
    process.exit(1);
  });