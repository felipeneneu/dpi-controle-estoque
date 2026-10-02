import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { makeApp, ensureSchema, resetDb } from '../helpers/app.js';
import { db } from '../../src/db/index.js';
import { cartuchos, machines, stockItems, stockTransactions } from '../../src/db/schema.js';
import { newId } from '../../src/lib/ids.js';
import { SOURCE_CARTUCHO_MANUAL, SOURCE_CARTUCHO_SWAP } from '../../src/routes/cartuchos.js';

/**
 * BR-052 / BR-054: a troca de cartucho e o que move o estoque.
 *
 * O par de invariantes que estes testes existe para travar:
 * - **carregar nao baixa**. Um `OUT` na carga faz o estoque cair duas vezes
 *   (na compra e na carga) e o operador ve "esgotado" com a maquina cheia.
 * - **trocar descarta o restante inteiro**, uma linha so. Sem `oldAction`: quem
 *   saiu da maquina e lixo, e um `OUT` parcelado por tentativas de cliques
 *   duplicados deixa o ledger mentindo.
 */

const C = {
  ML: 775,
  CAPacidade: 775,
};

describe('cartucho routes', () => {
  let app: FastifyInstance;
  let token: string;
  let machineId: string;
  let itemId: string;
  let itemSemRastreio: string;

  beforeAll(async () => {
    app = await makeApp();
    await app.ready();
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { name: 'Op', email: 'cartucho@exemplo.com', password: 'senha123' },
    });
    const { users } = await import('../../src/db/schema.js');
    await db.update(users).set({ role: 'ADMIN' }).where(eq(users.email, 'cartucho@exemplo.com'));
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'cartucho@exemplo.com', password: 'senha123' },
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
      name: 'HP Latex 330',
      brand: 'HP',
      model: 'Latex 330',
      technology: 'EcoSolvent',
    });

    itemId = await seedItem('hp_tinta-cyan', 'CZ683A');
    itemSemRastreio = await seedItem('Solvente', null);
  });

  async function seedItem(name: string, code: string | null, unit = 'ml') {
    const id = newId();
    await db.insert(stockItems).values({
      id,
      name,
      category: 'INK_SUPPLY',
      unit,
      code,
      currentQuantity: 0,
      minQuantity: 0,
    });
    return id;
  }

  /** Cadastra um cartucho em deposito via rota, como o operador faria na compra. */
  async function cadastrar(payload: Record<string, unknown> = {}) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/cartuchos',
      headers: { authorization: `Bearer ${token}` },
      payload: { stockItemId: itemId, channel: 'C', levelInitial: C.ML, ...payload },
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  async function transactionsForItem() {
    return await db.select().from(stockTransactions).where(eq(stockTransactions.itemId, itemId)).all();
  }

  async function cartucho(cartuchoId: string) {
    return await db.select().from(cartuchos).where(eq(cartuchos.id, cartuchoId)).get();
  }

  describe('autenticacao e autorizacao', () => {
    it('GET /api/cartuchos exige autenticacao', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/cartuchos' });
      expect(res.statusCode).toBe(401);
    });

    it('POST /api/machines/:id/active-cartucho exige autenticacao', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/machines/${machineId}/active-cartucho`,
        payload: { cartuchoId: 'x' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('cadastrar cartucho com payload invalido devolve 400 e nao grava', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/cartuchos',
        headers: { authorization: `Bearer ${token}` },
        payload: { stockItemId: itemId },
      });
      expect(res.statusCode).toBe(400);
      expect(await db.select().from(cartuchos).all()).toHaveLength(0);
    });
  });

  describe('cadastro: a compra e a saida do item', () => {
    it('cadastra em deposito, NEW, com nivel inicial virando nivel atual', async () => {
      const body = await cadastrar();

      expect(body.state).toBe('NEW');
      expect(body.location).toBe('deposito');
      expect(body.levelCurrent).toBe(C.ML);
      expect(body.levelCapacity).toBe(C.ML);
    });

    it('nao gera movimentacao no ledger: cadastrar e a compra, nao a carga', async () => {
      await cadastrar();
      // A baixa acontece fora do sistema (nota de compra). Aqui nao ha o que
      // baixar ainda - a tinta esta no carrinho de reserva.
      expect(await transactionsForItem()).toHaveLength(0);
    });

    it('rejeita nivel que nao e numero (o AJV do Fastify coagiria null -> 0)', async () => {
      // Sem `type: 'number'` no JSON Schema, `null` chegaria como 0 e criaria um
      // cartucho vazio sem avisar. Ver `createCartuchoSchema`.
      for (const levelInitial of [null, 'abc', {}, [775], true]) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/cartuchos',
          headers: { authorization: `Bearer ${token}` },
          payload: { stockItemId: itemId, channel: 'C', levelInitial },
        });
        expect(res.statusCode).toBe(400);
      }
      expect(await db.select().from(cartuchos).all()).toHaveLength(0);
    });

    it('rejeita nivel negativo e capacidade nao positiva', async () => {
      const negativo = await app.inject({
        method: 'POST',
        url: '/api/cartuchos',
        headers: { authorization: `Bearer ${token}` },
        payload: { stockItemId: itemId, channel: 'C', levelInitial: -1 },
      });
      expect(negativo.statusCode).toBe(400);

      for (const levelCapacity of [0, -5, null, 'x']) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/cartuchos',
          headers: { authorization: `Bearer ${token}` },
          payload: { stockItemId: itemId, channel: 'C', levelInitial: C.ML, levelCapacity },
        });
        expect(res.statusCode).toBe(400);
      }
      expect(await db.select().from(cartuchos).all()).toHaveLength(0);
    });

    it('rejeita unidade diferente de ml/pct', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/cartuchos',
        headers: { authorization: `Bearer ${token}` },
        payload: { stockItemId: itemId, channel: 'C', levelInitial: C.ML, unit: 'litro' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('devolve 404 para item inexistente', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/cartuchos',
        headers: { authorization: `Bearer ${token}` },
        payload: { stockItemId: 'nao-existe', channel: 'C', levelInitial: C.ML },
      });
      expect(res.statusCode).toBe(404);
    });

    it('herda a unidade do item quando o body nao manda (toner = pct)', async () => {
      const pctItem = await seedItem('konica_toner-black', null, 'pct');
      const res = await app.inject({
        method: 'POST',
        url: '/api/cartuchos',
        headers: { authorization: `Bearer ${token}` },
        payload: { stockItemId: pctItem, channel: 'K', levelInitial: 100 },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().unit).toBe('pct');
      expect(res.json().levelCapacity).toBe(100);
    });
  });

  describe('carga: nao baixa estoque', () => {
    it('marca IN_USE, aponta a maquina e nao grava nenhum OUT', async () => {
      const { id } = await cadastrar();

      const res = await app.inject({
        method: 'POST',
        url: `/api/machines/${machineId}/active-cartucho`,
        headers: { authorization: `Bearer ${token}` },
        payload: { cartuchoId: id },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().baixa).toBeNull();

      const row = await cartucho(id);
      expect(row!.state).toBe('IN_USE');
      expect(row!.machineId).toBe(machineId);
      expect(row!.location).toBe(`machine:${machineId}`);

      // O invariante central: carregar nao mexe no estoque.
      expect(await transactionsForItem()).toHaveLength(0);
    });

    it('mantem o saldo derivado igual ao saldo em deposito (nada foi consumido)', async () => {
      const { id } = await cadastrar();
      await app.inject({
        method: 'POST',
        url: `/api/machines/${machineId}/active-cartucho`,
        headers: { authorization: `Bearer ${token}` },
        payload: { cartuchoId: id },
      });

      const res = await app.inject({
        method: 'GET',
        url: `/api/cartuchos/deposito/${itemId}`,
        headers: { authorization: `Bearer ${token}` },
      });
      const body = res.json();
      // Saiu do deposito (NEW -> IN_USE) mas continua sendo estoque: 775.
      expect(body.emDeposito).toBe(0);
      expect(body.emUso).toBe(1);
      expect(body.saldoDerivado).toBe(C.ML);
    });

    it('reenvio do mesmo cartucho e idempotente e nao gera baixa', async () => {
      const { id } = await cadastrar();
      const url = `/api/machines/${machineId}/active-cartucho`;
      const opts = { headers: { authorization: `Bearer ${token}` }, payload: { cartuchoId: id } };

      await app.inject({ method: 'POST', url, ...opts });
      const segunda = await app.inject({ method: 'POST', url, ...opts });

      expect(segunda.statusCode).toBe(200);
      expect(await transactionsForItem()).toHaveLength(0);
    });

    it('recusa cartucho ja descartado', async () => {
      const { id } = await cadastrar();
      await app.inject({
        method: 'POST',
        url: `/api/machines/${machineId}/active-cartucho`,
        headers: { authorization: `Bearer ${token}` },
        payload: { cartuchoId: id },
      });
      // Troca: outro cartucho no mesmo canal descarta o anterior.
      const outro = await cadastrar({ channel: 'C' });
      await app.inject({
        method: 'POST',
        url: `/api/machines/${machineId}/active-cartucho`,
        headers: { authorization: `Bearer ${token}` },
        payload: { cartuchoId: outro.id },
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/machines/${machineId}/active-cartucho`,
        headers: { authorization: `Bearer ${token}` },
        payload: { cartuchoId: id },
      });
      expect(res.statusCode).toBe(400);
    });

    it('recusa cartucho em uso em outra maquina', async () => {
      const outra = newId();
      await db.insert(machines).values({
        id: outra,
        name: 'Outra',
        brand: 'HP',
        model: 'Latex 330',
        technology: 'EcoSolvent',
      });
      const { id } = await cadastrar();
      await app.inject({
        method: 'POST',
        url: `/api/machines/${machineId}/active-cartucho`,
        headers: { authorization: `Bearer ${token}` },
        payload: { cartuchoId: id },
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/machines/${outra}/active-cartucho`,
        headers: { authorization: `Bearer ${token}` },
        payload: { cartuchoId: id },
      });
      expect(res.statusCode).toBe(400);
    });

    it('devolve 404 para maquina inexistente', async () => {
      const { id } = await cadastrar();
      const res = await app.inject({
        method: 'POST',
        url: '/api/machines/nao-existe/active-cartucho',
        headers: { authorization: `Bearer ${token}` },
        payload: { cartuchoId: id },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('troca: descarta o restante inteiro, uma linha so', () => {
    /** Simula consumo na maquina (o que a telemetria faz na Task 7). */
    async function consumirNaMaquina(cartuchoId: string, quantity: number) {
      await db.update(cartuchos).set({ levelCurrent: 116.25 }).where(eq(cartuchos.id, cartuchoId));
      expect(quantity).toBeGreaterThan(0);
    }

    it('baixa o restante do anterior e marca USED + discarded', async () => {
      const antigo = await cadastrar({ channel: 'C', cartridgeCode: 'CZ683A-1' });
      await app.inject({
        method: 'POST',
        url: `/api/machines/${machineId}/active-cartucho`,
        headers: { authorization: `Bearer ${token}` },
        payload: { cartuchoId: antigo.id },
      });
      await consumirNaMaquina(antigo.id, 658.75);

      const novo = await cadastrar({ channel: 'C', cartridgeCode: 'CZ683A-2' });
      const res = await app.inject({
        method: 'POST',
        url: `/api/machines/${machineId}/active-cartucho`,
        headers: { authorization: `Bearer ${token}` },
        payload: { cartuchoId: novo.id },
      });
      expect(res.statusCode).toBe(200);

      const descartado = await cartucho(antigo.id);
      expect(descartado!.state).toBe('USED');
      expect(descartado!.location).toBe('discarded');
      expect(descartado!.machineId).toBeNull();
      expect(descartado!.finishedAt).not.toBeNull();

      const txs = await transactionsForItem();
      expect(txs).toHaveLength(1);
      expect(txs[0]!.type).toBe('OUT');
      expect(txs[0]!.quantity).toBe(116.25);
      expect(txs[0]!.source).toBe(SOURCE_CARTUCHO_SWAP);
      expect(txs[0]!.sourceRef).toBe(antigo.id);
    });

    it('nao existe devolucao ao estoque: quem saiu da maquina e descartado', async () => {
      const antigo = await cadastrar({ channel: 'C' });
      await app.inject({
        method: 'POST',
        url: `/api/machines/${machineId}/active-cartucho`,
        headers: { authorization: `Bearer ${token}` },
        payload: { cartuchoId: antigo.id },
      });
      await consumirNaMaquina(antigo.id, 100);
      const novo = await cadastrar({ channel: 'C' });

      const res = await app.inject({
        method: 'POST',
        url: `/api/machines/${machineId}/active-cartucho`,
        headers: { authorization: `Bearer ${token}` },
        payload: { cartuchoId: novo.id },
      });
      expect(res.statusCode).toBe(200);

      // A garantia e de estado, nao de status code: nao existe caminho de codigo
      // que devolva cartucho ao estoque. `oldAction: RETURN_TO_STOCK` no body e
      // descartado pelo AJV do Fastify (`removeAdditional`), mas mesmo que
      // chegasse ao handler nao ha parametro que faca a devolva - a troca e fixa.
      const descartado = await cartucho(antigo.id);
      expect(descartado).toMatchObject({
        state: 'USED',
        location: 'discarded',
        machineId: null,
      });
      expect(res.json().baixa.quantity).toBe(116.25);
    });

    it('nao baixa o cartucho que acabou de entrar', async () => {
      const antigo = await cadastrar({ channel: 'C' });
      await app.inject({
        method: 'POST',
        url: `/api/machines/${machineId}/active-cartucho`,
        headers: { authorization: `Bearer ${token}` },
        payload: { cartuchoId: antigo.id },
      });
      const novo = await cadastrar({ channel: 'C' });
      await app.inject({
        method: 'POST',
        url: `/api/machines/${machineId}/active-cartucho`,
        headers: { authorization: `Bearer ${token}` },
        payload: { cartuchoId: novo.id },
      });

      const carregado = await cartucho(novo.id);
      expect(carregado!.state).toBe('IN_USE');
      expect(carregado!.levelCurrent).toBe(C.ML);

      const txs = await transactionsForItem();
      expect(txs.every((t) => t.sourceRef !== novo.id)).toBe(true);
    });

    it('troca em outro canal nao toca no cartucho do canal original', async () => {
      const c = await cadastrar({ channel: 'C' });
      await app.inject({
        method: 'POST',
        url: `/api/machines/${machineId}/active-cartucho`,
        headers: { authorization: `Bearer ${token}` },
        payload: { cartuchoId: c.id },
      });

      const m = await cadastrar({ channel: 'M' });
      await app.inject({
        method: 'POST',
        url: `/api/machines/${machineId}/active-cartucho`,
        headers: { authorization: `Bearer ${token}` },
        payload: { cartuchoId: m.id },
      });

      // Dois canais, dois cartuchos em uso, zero baixa: so troca gera baixa.
      expect(await cartucho(c.id)).toMatchObject({ state: 'IN_USE', machineId });
      expect(await cartucho(m.id)).toMatchObject({ state: 'IN_USE', machineId });
      expect(await transactionsForItem()).toHaveLength(0);
    });

    it('descarta cartucho zerado sem gerar OUT de zero', async () => {
      const antigo = await cadastrar({ channel: 'C' });
      await app.inject({
        method: 'POST',
        url: `/api/machines/${machineId}/active-cartucho`,
        headers: { authorization: `Bearer ${token}` },
        payload: { cartuchoId: antigo.id },
      });
      await db.update(cartuchos).set({ levelCurrent: 0 }).where(eq(cartuchos.id, antigo.id));

      const novo = await cadastrar({ channel: 'C' });
      await app.inject({
        method: 'POST',
        url: `/api/machines/${machineId}/active-cartucho`,
        headers: { authorization: `Bearer ${token}` },
        payload: { cartuchoId: novo.id },
      });

      // Um OUT de 0 polui o ledger e derruba a media de consumo por job.
      expect(await transactionsForItem()).toHaveLength(0);
      expect(await cartucho(antigo.id)).toMatchObject({ state: 'USED', location: 'discarded' });
    });
  });

  describe('consumo manual', () => {
    it('decreta o nivel, registra o historico e baixa o ledger', async () => {
      const { id } = await cadastrar();
      await app.inject({
        method: 'POST',
        url: `/api/machines/${machineId}/active-cartucho`,
        headers: { authorization: `Bearer ${token}` },
        payload: { cartuchoId: id },
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/machines/${machineId}/cartuchos/${id}/consumo`,
        headers: { authorization: `Bearer ${token}` },
        payload: { quantity: 50, reason: 'limpeza de cabecote' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ levelBefore: C.ML, levelAfter: 725 });

      expect(await cartucho(id)).toMatchObject({ levelCurrent: 725 });

      const txs = await transactionsForItem();
      expect(txs).toHaveLength(1);
      expect(txs[0]).toMatchObject({
        type: 'OUT',
        quantity: 50,
        source: SOURCE_CARTUCHO_MANUAL,
        sourceRef: id,
      });
    });

    it('registra attribution=manual com o antes e o depois', async () => {
      const { id } = await cadastrar();
      await app.inject({
        method: 'POST',
        url: `/api/machines/${machineId}/cartuchos/${id}/consumo`,
        headers: { authorization: `Bearer ${token}` },
        payload: { quantity: 100 },
      });

      const res = await app.inject({
        method: 'GET',
        url: `/api/machines/${machineId}/cartuchos/consumo`,
        headers: { authorization: `Bearer ${token}` },
      });
      const rows = res.json();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        cartuchoId: id,
        attribution: 'manual',
        levelBefore: C.ML,
        levelAfter: 675,
        unit: 'ml',
      });
      expect(rows[0].quantityLabel).toBe('100 ml');
    });

    it('nao deixa o nivel negativo quando o consumo passa do saldo', async () => {
      const { id } = await cadastrar();
      const res = await app.inject({
        method: 'POST',
        url: `/api/machines/${machineId}/cartuchos/${id}/consumo`,
        headers: { authorization: `Bearer ${token}` },
        payload: { quantity: 5000 },
      });
      expect(res.statusCode).toBe(200);
      // Clamp em zero: um negativo no saldo deriva alerta de reposicao com
      // numero inventado.
      expect(res.json().levelAfter).toBe(0);
    });

    it('rejeita quantity nao positiva ou nao finita', async () => {
      const { id } = await cadastrar();
      for (const quantity of [0, -10, null, 'ml']) {
        const res = await app.inject({
          method: 'POST',
          url: `/api/machines/${machineId}/cartuchos/${id}/consumo`,
          headers: { authorization: `Bearer ${token}` },
          payload: { quantity },
        });
        expect(res.statusCode).toBe(400);
      }
      expect(await cartucho(id)).toMatchObject({ levelCurrent: C.ML });
    });

    it('resolve o item pelo codigo do cartucho', async () => {
      const { id } = await cadastrar({ cartridgeCode: 'CZ683A' });
      const res = await app.inject({
        method: 'POST',
        url: `/api/machines/${machineId}/cartuchos/ignored/consumo`,
        headers: { authorization: `Bearer ${token}` },
        payload: { quantity: 25, byCode: 'CZ683A' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().cartuchoId).toBe(id);
      expect(await cartucho(id)).toMatchObject({ levelCurrent: 750 });
    });

    it('devolve 409 com os candidatos quando o codigo do item e ambiguo', async () => {
      const a = await seedItem('RP420 Fosco 0,76m', '011983');
      await seedItem('RP420 Fosco 1,52m', '011983');
      await cadastrar();
      await db.update(stockItems).set({ code: '011983' }).where(eq(stockItems.id, itemId));
      expect(a).toBeTruthy();

      const res = await app.inject({
        method: 'POST',
        url: `/api/machines/${machineId}/cartuchos/x/consumo`,
        headers: { authorization: `Bearer ${token}` },
        payload: { quantity: 10, byCode: '011983' },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().candidatos).toHaveLength(3);
    });

    it('rejeita code inexistente com 400, nao 404 de cartucho', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/machines/${machineId}/cartuchos/x/consumo`,
        headers: { authorization: `Bearer ${token}` },
        payload: { quantity: 10, byCode: 'NAO-EXISTE' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('painel da maquina', () => {
    it('lista os cartuchos IN_USE por canal com percentual', async () => {
      const { id } = await cadastrar({ channel: 'C' });
      await app.inject({
        method: 'POST',
        url: `/api/machines/${machineId}/active-cartucho`,
        headers: { authorization: `Bearer ${token}` },
        payload: { cartuchoId: id },
      });
      await db.update(cartuchos).set({ levelCurrent: 193.75 }).where(eq(cartuchos.id, id));
      await cadastrar({ channel: 'M' }); // fica NEW, nao entra no painel

      const res = await app.inject({
        method: 'GET',
        url: `/api/machines/${machineId}/cartuchos`,
        headers: { authorization: `Bearer ${token}` },
      });
      const rows = res.json();
      expect(rows).toHaveLength(1);
      expect(rows[0].channel).toBe('C');
      expect(rows[0].pct).toBeCloseTo(25, 5);
      expect(rows[0].pctLabel).toBe(25);
      expect(rows[0].levelLabel).toBe('193,75 ml');
      expect(rows[0].capacityLabel).toBe('775 ml');
    });

    it('devolve 404 para maquina inexistente', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/machines/nao-existe/cartuchos',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('saldo derivado em GET /api/stock-items', () => {
    it('usa o saldo derivado e diz a origem', async () => {
      await cadastrar({ channel: 'C' });
      const emUso = await cadastrar({ channel: 'M' });
      await app.inject({
        method: 'POST',
        url: `/api/machines/${machineId}/active-cartucho`,
        headers: { authorization: `Bearer ${token}` },
        payload: { cartuchoId: emUso.id },
      });
      await db.update(cartuchos).set({ levelCurrent: 100 }).where(eq(cartuchos.id, emUso.id));

      const res = await app.inject({
        method: 'GET',
        url: '/api/stock-items',
        headers: { authorization: `Bearer ${token}` },
      });
      const row = res.json().find((r: { id: string }) => r.id === itemId);
      expect(row.currentQuantity).toBe(C.ML + 100);
      expect(row.origemSaldo).toBe('cartuchos');
    });

    it('item sem cartucho mantem o agregado e origem "agregado"', async () => {
      await db.update(stockItems).set({ currentQuantity: 42 }).where(eq(stockItems.id, itemSemRastreio));

      const res = await app.inject({
        method: 'GET',
        url: '/api/stock-items',
        headers: { authorization: `Bearer ${token}` },
      });
      const row = res.json().find((r: { id: string }) => r.id === itemSemRastreio);
      expect(row.currentQuantity).toBe(42);
      expect(row.origemSaldo).toBe('agregado');
    });

    it('item com todos os cartuchos descartados mostra 0 em cartuchos, nao volta ao agregado', async () => {
      await db.update(stockItems).set({ currentQuantity: 500 }).where(eq(stockItems.id, itemId));
      const { id } = await cadastrar();
      await db
        .update(cartuchos)
        .set({ state: 'USED', location: 'discarded', levelCurrent: 0 })
        .where(eq(cartuchos.id, id));

      const res = await app.inject({
        method: 'GET',
        url: '/api/stock-items',
        headers: { authorization: `Bearer ${token}` },
      });
      const row = res.json().find((r: { id: string }) => r.id === itemId);
      // Fallar para 500 aqui seria pior que zero: o item esta esgotado.
      expect(row.currentQuantity).toBe(0);
      expect(row.origemSaldo).toBe('cartuchos');
      expect(row.status).toBe('OUT_OF_STOCK');
    });
  });

  describe('cascade', () => {
    it('excluir o item apaga os cartuchos', async () => {
      const { id } = await cadastrar();
      await app.inject({
        method: 'POST',
        url: `/api/machines/${machineId}/active-cartucho`,
        headers: { authorization: `Bearer ${token}` },
        payload: { cartuchoId: id },
      });

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/stock-items/${itemId}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(204);

      const rows = await db
        .select()
        .from(cartuchos)
        .where(and(eq(cartuchos.stockItemId, itemId)))
        .all();
      expect(rows).toHaveLength(0);
    });
  });
});