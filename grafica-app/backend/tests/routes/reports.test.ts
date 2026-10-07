import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { makeApp, ensureSchema, resetDb } from '../helpers/app.js';
import { db } from '../../src/db/index.js';
import { inkConsumptionLog, machines, users } from '../../src/db/schema.js';
import { newId } from '../../src/lib/ids.js';

describe('GET /api/reports/consumption (Relatório com ink_consumption_log desacoplado)', () => {
  let app: FastifyInstance;
  let token: string;
  let machineId: string;

  beforeAll(async () => {
    app = await makeApp();
    await app.ready();
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { name: 'Op Relatórios', email: 'op-relatorios@exemplo.com', password: 'senha123' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'op-relatorios@exemplo.com', password: 'senha123' },
    });
    token = res.json().token as string;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await ensureSchema();
    await resetDb();

    machineId = newId();
    await db.insert(machines).values({
      id: machineId,
      name: 'HP Latex 365',
      brand: 'HP',
      model: 'Latex 365',
      technology: 'Latex',
    });
  });

  it('retorna agregados de ink_consumption_log por canal no mês', async () => {
    const currentMonth = '2026-10';
    const dateInMonth = new Date('2026-10-05T14:00:00.000Z');

    // Registrar 2 consumos de Cyan e 1 de Magenta
    await db.insert(inkConsumptionLog).values([
      {
        id: newId(),
        machineId,
        channel: 'Cyan',
        mlConsumed: 45.5,
        createdAt: dateInMonth,
      },
      {
        id: newId(),
        machineId,
        channel: 'Cyan',
        mlConsumed: 30.0,
        createdAt: dateInMonth,
      },
      {
        id: newId(),
        machineId,
        channel: 'Magenta',
        mlConsumed: 20.0,
        createdAt: dateInMonth,
      },
    ]);

    const res = await app.inject({
      method: 'GET',
      url: `/api/reports/consumption?month=${currentMonth}&machineId=${machineId}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.month).toBe(currentMonth);
    expect(body.machineId).toBe(machineId);

    expect(body.inkConsumptionLogs).toBeDefined();
    expect(body.inkConsumptionLogs.totalMl).toBeCloseTo(95.5, 2);

    const cyan = body.inkConsumptionLogs.byChannel.find((c: any) => c.channel === 'Cyan');
    expect(cyan).toBeDefined();
    expect(cyan.totalMl).toBeCloseTo(75.5, 2);
    expect(cyan.count).toBe(2);

    const magenta = body.inkConsumptionLogs.byChannel.find((c: any) => c.channel === 'Magenta');
    expect(magenta).toBeDefined();
    expect(magenta.totalMl).toBeCloseTo(20.0, 2);
    expect(magenta.count).toBe(1);
  });
});
