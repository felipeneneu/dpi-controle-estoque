import { db } from '../src/db/index.js';
import { stockItems } from '../src/db/schema.js';
import { newId } from '../src/lib/ids.js';

interface MaterialSeed {
  name: string;
  width: number;
  code?: string;
}

const MATERIALS: MaterialSeed[] = [
  // DP100GTS BRILHO — envelopamento de veículos
  { name: 'DP100GTS Brilho', width: 1.06, code: '0130' },
  { name: 'DP100GTS Brilho', width: 1.27, code: '0131' },
  { name: 'DP100GTS Brilho', width: 1.52, code: '0132' },

  // RP400 BRILHO
  { name: 'RP400 Brilho', width: 1.06, code: '0150' },
  { name: 'RP400 Brilho', width: 1.27, code: '0152' },
  { name: 'RP400 Brilho', width: 1.52, code: '0154' },

  // RP420 FOSCO
  { name: 'RP420 Fosco', width: 0.76, code: '011983' },
  { name: 'RP420 Fosco', width: 1.52, code: '011983' },

  // DE501 S BRILHO
  { name: 'DE501 S Brilho', width: 0.76, code: '0138' },
  { name: 'DE501 S Brilho', width: 1.06, code: '0136' },
  { name: 'DE501 S Brilho', width: 1.27, code: '0137' },

  // DE520 S FOSCO
  { name: 'DE520 S Fosco', width: 1.27, code: '0162' },
  { name: 'DE520 S Fosco', width: 1.52, code: '0163' },

  // DE530 S TRANSPARENTE BRILHO
  { name: 'DE530 S Transparente Brilho', width: 0.76, code: '0229' },
  { name: 'DE530 S Transparente Brilho', width: 1.06, code: '0227' },
  { name: 'DE530 S Transparente Brilho', width: 1.27, code: '0228' },
  { name: 'DE530 S Transparente Brilho', width: 1.52, code: '0229' },

  // DE540 S BRILHO (Blockout)
  { name: 'DE540 S Brilho (Blockout)', width: 1.52, code: '0184' },

  // DE550 S FOSCO (Blockout)
  { name: 'DE550 S Fosco (Blockout)', width: 1.06, code: '0185' },
  { name: 'DE550 S Fosco (Blockout)', width: 1.52, code: '01__' },

  // Outros
  { name: 'Jateado', width: 1.52 },
  { name: 'Perfurado', width: 1.37 },
  { name: 'Couche 90G', width: 1.5 },
  { name: 'Sulfite 90G', width: 0.91 },
  { name: 'Sulfite 90G', width: 1.5 },
];

async function run() {
  const existing = await db.select().from(stockItems).all();
  const existingNames = new Set(existing.map((i) => i.name));

  let inserted = 0;
  let skipped = 0;

  for (const m of MATERIALS) {
    const name = `${m.name} ${m.width.toFixed(2).replace('.', ',')} M`;
    if (existingNames.has(name)) {
      skipped++;
      continue;
    }

    await db.insert(stockItems).values({
      id: newId(),
      name,
      category: 'PAPER_MEDIA',
      subType: 'Bobina',
      unit: 'm',
      width: m.width,
      code: m.code,
      currentQuantity: 50,
      minQuantity: 10,
      status: 'AVAILABLE',
    });
    existingNames.add(name);
    inserted++;
  }

  console.log(`[seed-hp-materials] ${inserted} criados, ${skipped} já existentes (pulados).`);
}

void run()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error('[seed-hp-materials] erro:', err);
    process.exit(1);
  });
