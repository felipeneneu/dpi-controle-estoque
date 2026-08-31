import { eq } from 'drizzle-orm';
import { users, stockItems, machines } from './db/schema.js';
import { db } from './db/index.js';
import { hashPassword } from './lib/password.js';
import { newId } from './lib/ids.js';

export async function Seed() {
  const existing = await db.select().from(users).where(eq(users.email, 'felipe@grafica.local')).get();
  if (!existing) {
    await db.insert(users).values({
      id: newId(),
      name: 'Felipe Neneu',
      email: 'felipe@grafica.local',
      passwordHash: hashPassword('admin123'),
      role: 'DEV_MASTER',
      avatar: '/users/felipeneneu.jfif',
    });
    await db.insert(users).values({
      id: newId(),
      name: 'Operador',
      email: 'operador@grafica.local',
      passwordHash: hashPassword('operador123'),
      role: 'OPERATOR',
    });
  } else if (!existing.avatar) {
    await db.update(users).set({ avatar: '/users/felipeneneu.jfif' }).where(eq(users.id, existing.id));
  }

  const items = await db.select().from(stockItems).all();
  if (items.length === 0) {
const samples = [
      { name: 'Bobina de Vinil 1.37m', category: 'PAPER_MEDIA', subType: 'Bobina', unit: 'm', width: 1.37, currentQuantity: 120, minQuantity: 50 },
      { name: 'Papel Fotográfico Brilhante', category: 'PAPER_MEDIA', subType: 'Cut-sheet', unit: 'fls', width: 1.06, currentQuantity: 800, minQuantity: 200 },
      { name: 'Tinta UV Cyan', category: 'INK_SUPPLY', subType: 'Cartucho', unit: 'ml', currentQuantity: 3000, minQuantity: 500 },
      { name: 'Tinta UV Magenta', category: 'INK_SUPPLY', subType: 'Cartucho', unit: 'ml', currentQuantity: 400, minQuantity: 500 },
      { name: 'Placa de ACM 3mm', category: 'OTHER', subType: 'Placa', unit: 'fls', currentQuantity: 30, minQuantity: 10 },
    ] as const;
    for (const s of samples) {
      await db.insert(stockItems).values({
        id: newId(),
        ...s,
        status: s.currentQuantity <= s.minQuantity ? 'LOW_STOCK' : s.currentQuantity <= 0 ? 'OUT_OF_STOCK' : 'AVAILABLE',
      });
    }
  }

  const mach = await db.select().from(machines).all();
  if (mach.length === 0) {
    for (const m of [
      { name: 'Mimaki UCJV300-75', brand: 'Mimaki', model: 'UCJV300-75', technology: 'Inkjet', imageUrl: '/machine/mimaki.jfif' },
      { name: 'Konika', brand: 'Konica Minolta', model: 'C3070', technology: 'Laser', imageUrl: '/machine/konika.jfif' },
      { name: 'HP Latex 330', brand: 'HP', model: 'Latex 330', technology: 'Latex', imageUrl: '/machine/hp-latex.jfif' },
    ]) {
      await db.insert(machines).values({ id: newId(), ...m, status: 'ACTIVE' });
    }
  }

  console.log('Seeded database.');
}
