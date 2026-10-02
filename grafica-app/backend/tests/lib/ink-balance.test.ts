import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { ensureSchema, resetDb } from '../helpers/app.js';
import { db } from '../../src/db/index.js';
import { cartuchos, stockItems } from '../../src/db/schema.js';
import { newId } from '../../src/lib/ids.js';
import {
  saldoDerivado,
  saldosDerivados,
  cartuchosEmDeposito,
  itemTemCartuchos,
  resolveItemByCode,
  candidatosPorCodigo,
  CodigoAmbíguoError,
  CodigoNaoEncontradoError,
} from '../../src/lib/ink-balance.js';

/**
 * BR-052: o saldo derivado e a distincao `null` vs `0`.
 *
 * O caso que justifica o helper: `SUM` de conjunto vazio devolve `0` em SQL. Se
 * `saldoDerivado` devolvesse `0` para item sem cartucho, folha e solvente seriam
 * tratados como "Tinta C esgotada" pelo alerta global de estoque.
 */

async function seedItem(values: { name?: string; code?: string | null; unit?: string; qty?: number } = {}) {
  const id = newId();
  await db.insert(stockItems).values({
    id,
    name: values.name ?? 'hp_tinta-cyan',
    category: 'INK_SUPPLY',
    unit: values.unit ?? 'ml',
    code: values.code ?? null,
    currentQuantity: values.qty ?? 0,
    minQuantity: 0,
  });
  return id;
}

async function seedCartucho(values: {
  itemId: string;
  level: number;
  state: 'NEW' | 'IN_USE' | 'USED' | 'SCRAPPED';
  unit?: string;
  channel?: string;
  cartridgeCode?: string | null;
  location?: string;
}) {
  const id = newId();
  await db.insert(cartuchos).values({
    id,
    stockItemId: values.itemId,
    channel: values.channel ?? 'C',
    unit: values.unit ?? 'ml',
    levelInitial: 775,
    levelCurrent: values.level,
    levelCapacity: 775,
    state: values.state,
    location: values.location ?? (values.state === 'NEW' ? 'deposito' : 'machine:m1'),
    cartridgeCode: values.cartridgeCode ?? null,
  });
  return id;
}

describe('saldoDerivado: null (sem ativo) vs 0 (ativo zerado)', () => {
  beforeEach(async () => {
    await ensureSchema();
    await resetDb();
  });

  it('devolve null para item sem nenhum cartucho, para o caller cair no agregado', async () => {
    const itemId = await seedItem({ name: 'Vinil Adesivo', unit: 'm', qty: 50 });
    // null = "nao rastreado por cartucho". Se devolvesse 0, folha e solvente
    // entrariam no alerta global como "Tinta C esgotada".
    expect(await saldoDerivado(itemId)).toBeNull();
    expect(await itemTemCartuchos(itemId)).toBe(false);
  });

  it('distingue item sem cartucho de item com cartucho zerado', async () => {
    // O par que o alerta global depende: os dois tem saldo 0, so um esta
    // esgotado de verdade.
    const semAtivo = await seedItem({ name: 'Solvente', unit: 'ml' });
    const zerado = await seedItem({ name: 'hp_tinta-cyan' });
    await seedCartucho({ itemId: zerado, level: 0, state: 'NEW' });

    expect(await saldoDerivado(semAtivo)).toBeNull();
    expect(await saldoDerivado(zerado)).toBe(0);
  });

  it('soma NEW + IN_USE e ignora USED/SCRAPPED', async () => {
    const itemId = await seedItem();
    await seedCartucho({ itemId, level: 775, state: 'NEW' });
    await seedCartucho({ itemId, level: 400, state: 'IN_USE' });
    await seedCartucho({ itemId, level: 120, state: 'USED', location: 'discarded' });
    await seedCartucho({ itemId, level: 30, state: 'SCRAPPED', location: 'discarded' });

    expect(await saldoDerivado(itemId)).toBe(1175);
  });

  it('devolve 0 quando todo cartucho do item ja foi descartado', async () => {
    const itemId = await seedItem();
    await seedCartucho({ itemId, level: 120, state: 'USED', location: 'discarded' });

    expect(await saldoDerivado(itemId)).toBe(0);
    expect(await itemTemCartuchos(itemId)).toBe(true);
  });

  it('soma unidades diferentes sem converter (ml e pct sao saldos distintos)', async () => {
    const tinta = await seedItem({ name: 'hp_tinta-cyan' });
    const toner = await seedItem({ name: 'konica_toner-cyan', unit: 'pct' });
    await seedCartucho({ itemId: tinta, level: 775, state: 'NEW' });
    await seedCartucho({ itemId: toner, level: 80, state: 'IN_USE', unit: 'pct' });

    expect(await saldoDerivado(tinta)).toBe(775);
    expect(await saldoDerivado(toner)).toBe(80);
  });

  it('saldosDerivados agrega varios itens e omite os que nao tem cartucho', async () => {
    const tinta = await seedItem({ name: 'hp_tinta-cyan' });
    const toner = await seedItem({ name: 'konica_toner-black', unit: 'pct' });
    const folha = await seedItem({ name: 'Couché A4 250g', unit: 'fls' });
    await seedCartucho({ itemId: tinta, level: 500, state: 'NEW', channel: 'C' });
    await seedCartucho({ itemId: toner, level: 40, state: 'IN_USE', channel: 'K', unit: 'pct' });

    const mapa = await saldosDerivados([tinta, toner, folha]);

    expect(mapa.get(tinta)).toBe(500);
    expect(mapa.get(toner)).toBe(40);
    expect(mapa.has(folha)).toBe(false); // sem cartucho -> caller le currentQuantity
  });
});

describe('cartuchosEmDeposito: gate do alerta de reposicao', () => {
  beforeEach(async () => {
    await ensureSchema();
    await resetDb();
  });

  it('conta apenas cartuchos NEW', async () => {
    const itemId = await seedItem();
    await seedCartucho({ itemId, level: 775, state: 'NEW' });
    await seedCartucho({ itemId, level: 775, state: 'NEW', channel: 'M' });
    await seedCartucho({ itemId, level: 200, state: 'IN_USE', channel: 'C' });
    await seedCartucho({ itemId, level: 50, state: 'USED', channel: 'Y', location: 'discarded' });

    expect(await cartuchosEmDeposito(itemId)).toBe(2);
  });

  it('devolve 0 quando o item so tem o cartucho que esta na maquina', async () => {
    const itemId = await seedItem();
    await seedCartucho({ itemId, level: 100, state: 'IN_USE' });

    // Este e o caso que dispara o aviso: acabando na maquina e nada em deposito.
    expect(await cartuchosEmDeposito(itemId)).toBe(0);
  });

  it('ignora cartucho NEW cujo location nao e deposito', async () => {
    // Link inconsistente: NEW mas apontando para a maquina. O gate BR-054 nao
    // pode contar isso como reserva, senao o alerta nunca dispara.
    const itemId = await seedItem();
    await seedCartucho({ itemId, level: 775, state: 'NEW', location: 'machine:m1' });

    expect(await cartuchosEmDeposito(itemId)).toBe(0);
    // O saldo derivado ignora `location`: o cartucho NEW ainda conta.
    expect(await saldoDerivado(itemId)).toBe(775);
  });
});

describe('resolveItemByCode: recusa adivinhar quando o codigo e ambiguo', () => {
  beforeEach(async () => {
    await ensureSchema();
    await resetDb();
  });

  it('resolve codigo unico', async () => {
    const itemId = await seedItem({ name: 'hp_tinta-cyan', code: 'CZ683A' });
    expect(await resolveItemByCode('CZ683A')).toBe(itemId);
  });

  it('ignora espacos em volta do codigo digitado', async () => {
    const itemId = await seedItem({ name: 'hp_tinta-cyan', code: 'CZ683A' });
    expect(await resolveItemByCode('  CZ683A  ')).toBe(itemId);
  });

  it('lanca CodigoAmbíguoError quando o codigo bate com 2 itens', async () => {
    // Situacao real do seed HP: mesmo codigo em larguras diferentes.
    await seedItem({ name: 'RP420 Fosco 0,76m', code: '011983' });
    await seedItem({ name: 'RP420 Fosco 1,52m', code: '011983' });

    await expect(resolveItemByCode('011983')).rejects.toBeInstanceOf(CodigoAmbíguoError);
  });

  it('a excecao ambigua carrega os candidatos para o dialogo desambiguar', async () => {
    const a = await seedItem({ name: 'RP420 Fosco 0,76m', code: '011983' });
    const b = await seedItem({ name: 'RP420 Fosco 1,52m', code: '011983' });

    const candidatos = await candidatosPorCodigo('011983');
    expect(candidatos.map((c) => c.id).sort()).toEqual([a, b].sort());

    try {
      await resolveItemByCode('011983');
      expect.unreachable('deveria ter lancado CodigoAmbíguoError');
    } catch (err) {
      expect(err).toBeInstanceOf(CodigoAmbíguoError);
      expect((err as CodigoAmbíguoError).itemIds).toHaveLength(2);
    }
  });

  it('lanca CodigoNaoEncontradoError para codigo inexistente ou vazio', async () => {
    await expect(resolveItemByCode('CZ999Z')).rejects.toBeInstanceOf(CodigoNaoEncontradoError);
    await expect(resolveItemByCode('   ')).rejects.toBeInstanceOf(CodigoNaoEncontradoError);
  });

  it('item sem codigo nao e resolvido por codigo vazio', async () => {
    await seedItem({ name: 'hp_tinta-cyan', code: null });
    await expect(resolveItemByCode('')).rejects.toBeInstanceOf(CodigoNaoEncontradoError);
  });
});

describe('saldoDerivado: cartucho descartado nao volta ao estoque', () => {
  beforeEach(async () => {
    await ensureSchema();
    await resetDb();
  });

  it('apos a troca o saldo e a soma do que sobrou no deposito, sem o descartado', async () => {
    const itemId = await seedItem();
    const emUso = await seedCartucho({ itemId, level: 116.25, state: 'IN_USE' });
    const deposito = await seedCartucho({ itemId, level: 775, state: 'NEW', channel: 'M' });

    // Cenário da troca: o operador descarta os 116,25 ml restantes.
    await db
      .update(cartuchos)
      .set({ state: 'USED', location: 'discarded', finishedAt: new Date() })
      .where(eq(cartuchos.id, emUso));

    expect(await saldoDerivado(itemId)).toBe(775);
    expect(await cartuchosEmDeposito(itemId)).toBe(1);

    const remanescente = await db.select().from(cartuchos).where(eq(cartuchos.id, deposito)).get();
    expect(remanescente!.levelCurrent).toBe(775);
  });
});