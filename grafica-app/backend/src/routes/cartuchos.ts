import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq, desc, inArray, sql } from 'drizzle-orm';
import { cartuchos, cartuchoConsumo, machines, stockItems, stockTransactions } from '../db/schema.js';
import { db } from '../db/index.js';
import { newId } from '../lib/ids.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { formatLevel, levelPct, parseCartridgeUnit } from '../lib/ink-units.js';
import { DEFAULT_INK_CAPACITY_ML } from '../agents/hp-latex/constants.js';
import { CodigoAmbíguoError, candidatosPorCodigo, resolveItemByCode, saldoDerivado } from '../lib/ink-balance.js';

/**
 * Rotas de cartucho de tinta/toner (ADR-052 / BR-052).
 *
 * Duas decisoes desta ADR aparecem no codigo como ausencia de opcao, e nao como
 * validacao escondida:
 *
 * 1. `POST /api/machines/:id/active-cartucho` **nao** aceita `oldAction`. O
 *    operador trocou o cartucho, entao o anterior e descartado (`USED` +
 *    `discarded`) com uma unica linha `OUT`. Nao existe `RETURN_TO_STOCK`: para
 *    devolver ao estoque o operador precisa cadastrar o cartucho de novo.
 * 2. `POST .../consumo` so existe para item que tem `code`. Toner Konica nao tem
 *    codigo rastreavel, entao nao ha o que o operador digitar la.
 */

/** `source` gravado no ledger quando a baixa vem da troca de cartucho. */
export const SOURCE_CARTUCHO_SWAP = 'cartucho_swap';
/** `source` gravado no ledger quando a baixa vem de lancamento manual. */
export const SOURCE_CARTUCHO_MANUAL = 'cartucho_manual';

/**
 * Portões de validacao.
 *
 * O JSON Schema desta rota **nao** declara `type: 'number'` nos campos numericos,
 * de proposito: o Fastify roda o AJV com `coerceTypes: 'array'`, que converte
 * `null` em `0` e `[5]` em `5` **antes** do handler. Verificado empiricamente:
 * `POST { levelInitial: null }` chegava ao handler como `0` e criava um cartucho
 * vazio sem avisar. Declarar o tipo no JSON Schema (e `minimum`) faria o dado
 * corrompido passar pelo Zod ja convertido. Aqui o Zod e o unico portao:
 * `z.number().finite()` e o R-013 aplicado (`NaN <= 0` e `NaN > 0` sao ambos
 * false, entao `.finite()` vem sempre antes da comparacao).
 */
const createCartuchoSchema = z.object({
  stockItemId: z.string().min(1),
  channel: z.string().min(1).max(8),
  unit: z.string().min(1).max(8).optional(),
  levelInitial: z.number().finite().nonnegative(),
  levelCapacity: z.number().finite().positive().optional(),
  cartridgeCode: z.string().min(1).max(32).optional(),
});

const activeCartuchoSchema = z.object({
  cartuchoId: z.string().min(1),
  /** Canal pode ser omitido quando o cartucho ja o tem gravado. */
  channel: z.string().min(1).max(8).optional(),
});

const consumoSchema = z.object({
  quantity: z.number().finite().positive(),
  reason: z.string().max(200).optional(),
});

function badRequest(reply: { code: (s: number) => { send: (b: unknown) => unknown } }, error: string, extra?: Record<string, unknown>) {
  return reply.code(400).send({ error, ...extra });
}

export async function cartuchoRoutes(app: FastifyInstance) {
  /**
   * Lista cartuchos. Filtros opcionais por item, estado e maquina.
   */
  app.get('/api/cartuchos', {
    schema: {
      tags: ['Estoque'],
      summary: 'Listar cartuchos de tinta/toner',
      description: 'Retorna os cartuchos, opcionalmente filtrados por stockItemId, state ou machineId. Requer autenticação.',
      querystring: {
        type: 'object',
        properties: {
          stockItemId: { type: 'string' },
          state: { type: 'string' },
          machineId: { type: 'string' },
        },
      },
    },
    preHandler: [authenticate],
  }, async (request) => {
    const { stockItemId, state, machineId } = request.query as {
      stockItemId?: string;
      state?: string;
      machineId?: string;
    };
    const conditions = [];
    if (stockItemId) conditions.push(eq(cartuchos.stockItemId, stockItemId));
    if (state) conditions.push(eq(cartuchos.state, state as 'NEW'));
    if (machineId) conditions.push(eq(cartuchos.machineId, machineId));

    return await db
      .select()
      .from(cartuchos)
      .where(conditions.length ? and(...conditions) : undefined)
      .all();
  });

  /**
   * Cadastra um cartucho novo em deposito (`state = NEW`).
   *
   * Cadastrar e a "compra": e aqui que o item sai do agregado. A partir daqui o
   * cartucho e a unidade de estoque, e o `currentQuantity` do item para de ser
   * lido (BR-052).
   */
  app.post('/api/cartuchos', {
    schema: {
      tags: ['Estoque'],
      summary: 'Cadastrar cartucho em depósito',
      description: 'Cadastra um cartucho físico em depósito. A baixa de estoque ocorre aqui, na compra.',
      body: {
        type: 'object',
        required: ['stockItemId', 'channel', 'levelInitial'],
        properties: {
          stockItemId: { type: 'string' },
          channel: { type: 'string' },
          unit: { type: 'string' },
          levelInitial: { description: 'Nivel inicial (ml ou pct). Validad no Zod: ver createCartuchoSchema.' },
          levelCapacity: { description: 'Capacidade declarada. Padrao 775 ml ou 100 pct.' },
          cartridgeCode: { type: 'string' },
        },
      },
    },
    preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN', 'OPERATOR'])],
  }, async (request, reply) => {
    const parsed = createCartuchoSchema.safeParse(request.body);
    if (!parsed.success) {
      return badRequest(reply, parsed.error.issues[0]?.message ?? 'Payload inválido');
    }
    const body = parsed.data;

    const item = await db.select().from(stockItems).where(eq(stockItems.id, body.stockItemId)).get();
    if (!item) return reply.code(404).send({ error: 'Item de estoque não encontrado' });

    const unit = parseCartridgeUnit(body.unit ?? item.unit);
    if (!unit) {
      return badRequest(reply, `Unidade inválida: "${body.unit ?? item.unit}". Use "ml" ou "pct".`);
    }

    // Capacidade padrao: 775 ml para tinta (constante da Task 4, a unica fonte
    // do valor) e 100 para percentual. Sem isto o cartucho ficaria com
    // `levelCapacity = NULL` e todo alerta de reposicao cairia no ramo
    // "capacidade desconhecida" -> nunca dispara.
    const levelCapacity = body.levelCapacity ?? (unit === 'pct' ? 100 : DEFAULT_INK_CAPACITY_ML);
    const id = newId();
    await db.insert(cartuchos).values({
      id,
      stockItemId: body.stockItemId,
      channel: body.channel,
      unit,
      levelInitial: body.levelInitial,
      levelCurrent: body.levelInitial,
      levelCapacity,
      state: 'NEW',
      location: 'deposito',
      cartridgeCode: body.cartridgeCode ?? null,
      openedAt: new Date(),
    });

    const row = await db.select().from(cartuchos).where(eq(cartuchos.id, id)).get();
    return reply.code(201).send({ ...row, saldoDerivadoItem: await saldoDerivado(body.stockItemId) });
  });

  /**
   * Cartuchos carregados na maquina, por canal.
   *
   * A UI do canal da maquina consome isto para montar o painel de tintas: um
   * cartucho por canal, ja com o percentual formatado.
   */
  app.get('/api/machines/:id/cartuchos', {
    schema: {
      tags: ['Máquinas'],
      summary: 'Cartuchos carregados na máquina',
      description: 'Retorna os cartuchos IN_USE da máquina, com percentual e nível formatado. Requer autenticação.',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const machine = await db.select().from(machines).where(eq(machines.id, id)).get();
    if (!machine) return reply.code(404).send({ error: 'Máquina não encontrada' });

    const rows = await db
      .select()
      .from(cartuchos)
      .where(and(eq(cartuchos.machineId, id), eq(cartuchos.state, 'IN_USE')))
      .all();

    return rows.map((c) => {
      const pct = levelPct(c.levelCurrent, c.levelCapacity);
      return {
        ...c,
        pct,
        pctLabel: pct === null ? null : Math.round(pct),
        levelLabel: formatLevel(c.levelCurrent, c.unit),
        capacityLabel: c.levelCapacity === null ? null : formatLevel(c.levelCapacity, c.unit),
      };
    });
  });

  /**
   * Carrega ou troca o cartucho de um canal.
   *
   * Carregar **nao** baixa estoque. Trocar baixa **todo** o restante do cartucho
   * anterior com uma unica linha `OUT` e o marca como `discarded`.
   *
   * Body: `{ cartuchoId, channel? }`. Nao ha `oldAction` por construcao.
   */
  app.post('/api/machines/:id/active-cartucho', {
    schema: {
      tags: ['Máquinas'],
      summary: 'Carregar/trocar cartucho no canal da máquina',
      description:
        'Carrega um cartucho de depósito em um canal. Se já havia cartucho nesse canal, ' +
        'o anterior é descartado (USED + discarded) com uma única linha OUT pelo restante. ' +
        'Carregar não gera baixa. Não existe devolução ao estoque.',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        required: ['cartuchoId'],
        properties: {
          cartuchoId: { type: 'string' },
          channel: { type: 'string' },
        },
      },
    },
    preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN', 'OPERATOR'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = activeCartuchoSchema.safeParse(request.body);
    if (!parsed.success) {
      return badRequest(reply, parsed.error.issues[0]?.message ?? 'Payload inválido');
    }
    const { cartuchoId, channel: channelOverride } = parsed.data;

    const machine = await db.select().from(machines).where(eq(machines.id, id)).get();
    if (!machine) return reply.code(404).send({ error: 'Máquina não encontrada' });

    const cartucho = await db.select().from(cartuchos).where(eq(cartuchos.id, cartuchoId)).get();
    if (!cartucho) return reply.code(404).send({ error: 'Cartucho não encontrado' });

    if (cartucho.state === 'USED' || cartucho.state === 'SCRAPPED') {
      return badRequest(reply, 'Este cartucho já foi descartado e não pode ser carregado.');
    }
    if (cartucho.state === 'IN_USE') {
      if (cartucho.machineId === id) {
        // Reenvio do mesmo clique: idempotente, nao é troca.
        return { success: true, message: 'Cartucho já está em uso nesta máquina.', cartuchoId };
      }
      return badRequest(reply, 'Este cartucho já está em uso em outra máquina.');
    }

    const channel = channelOverride ?? cartucho.channel;
    if (!channel) return badRequest(reply, 'Informe o canal do cartucho.');

    // Cartucho anterior do MESMO canal (nao do mesmo item: canal e o slot).
    const anterior = await db
      .select()
      .from(cartuchos)
      .where(
        and(
          eq(cartuchos.machineId, id),
          eq(cartuchos.channel, channel),
          eq(cartuchos.state, 'IN_USE'),
        ),
      )
      .get();

    let baixa: { quantity: number; unit: string; itemName: string } | null = null;

    if (anterior && anterior.id !== cartucho.id) {
      // "Saiu da máquina é lixo": descarta integralmente, sem opção de devolver.
      const restante = anterior.levelCurrent;
      await db
        .update(cartuchos)
        .set({
          state: 'USED',
          location: 'discarded',
          machineId: null,
          finishedAt: new Date(),
        })
        .where(eq(cartuchos.id, anterior.id));

      if (restante > 0) {
        const itemAnterior = await db
          .select()
          .from(stockItems)
          .where(eq(stockItems.id, anterior.stockItemId))
          .get();
        await db.insert(stockTransactions).values({
          id: newId(),
          itemId: anterior.stockItemId,
          type: 'OUT',
          quantity: restante,
          reason:
            `Troca de cartucho: descarte do restante no canal ${channel} ` +
            `(${formatLevel(restante, anterior.unit)} de ${formatLevel(anterior.levelCapacity, anterior.unit)})`,
          source: SOURCE_CARTUCHO_SWAP,
          sourceRef: anterior.id,
          userId: (request.user as { sub?: string } | undefined)?.sub ?? null,
          userName: (request.user as { name?: string } | undefined)?.name ?? null,
        });
        baixa = {
          quantity: restante,
          unit: anterior.unit,
          itemName: itemAnterior?.name ?? anterior.stockItemId,
        };
      }
    }

    await db
      .update(cartuchos)
      .set({
        state: 'IN_USE',
        location: `machine:${id}`,
        machineId: id,
        channel,
        openedAt: cartucho.openedAt ?? new Date(),
      })
      .where(eq(cartuchos.id, cartucho.id));

    app.io.to('estoque').emit('cartuchos:updated', { machineId: id, channel });

    return {
      success: true,
      message: baixa
        ? `Cartucho carregado. Anterior descartado: ${formatLevel(baixa.quantity, baixa.unit)} de ${baixa.itemName}.`
        : 'Cartucho carregado no canal.',
      cartuchoId: cartucho.id,
      channel,
      baixa,
    };
  });

  /**
   * Lancamento manual de consumo por codigo do cartucho.
   *
   * Rota restrita a item que tem `code`: e o atalho "peguei a tinta do codigo tal".
   * Para toner (sem codigo) a telemetria e o alerta de reposicao cobrem o canal.
   */
  app.post('/api/machines/:id/cartuchos/:cartuchoId/consumo', {
    schema: {
      tags: ['Máquinas'],
      summary: 'Lançar consumo manual de cartucho',
      description:
        'Lança consumo manual em um cartucho (identificado por id). Aceita `byCode` no lugar de ' +
        'cartuchoId para o operador digitar o código do cartucho.',
      params: {
        type: 'object',
        required: ['id', 'cartuchoId'],
        properties: { id: { type: 'string' }, cartuchoId: { type: 'string' } },
      },
      body: {
        type: 'object',
        required: ['quantity'],
        properties: {
          quantity: { description: 'Consumo em ml ou pct. Validad no Zod: ver consumoSchema.' },
          byCode: { type: 'string' },
          reason: { type: 'string' },
        },
      },
    },
    preHandler: [authenticate, authorize(['DEV_MASTER', 'ADMIN', 'OPERATOR'])],
  }, async (request, reply) => {
    const { id, cartuchoId } = request.params as { id: string; cartuchoId: string };
    const body = request.body as { quantity?: number; byCode?: string; reason?: string };

    const machine = await db.select().from(machines).where(eq(machines.id, id)).get();
    if (!machine) return reply.code(404).send({ error: 'Máquina não encontrada' });

    let target: typeof cartuchos.$inferSelect | undefined;
    if (body.byCode) {
      let itemId: string;
      try {
        itemId = await resolveItemByCode(body.byCode);
      } catch (err) {
        if (err instanceof CodigoAmbíguoError) {
          const candidatos = await candidatosPorCodigo(err.codigo);
          return reply.code(409).send({
            error: err.message,
            codigo: err.codigo,
            candidatos,
          });
        }
        const message = err instanceof Error ? err.message : 'Falha ao resolver o código.';
        return badRequest(reply, message);
      }
      target = await db
        .select()
        .from(cartuchos)
        .where(and(eq(cartuchos.stockItemId, itemId), inArray(cartuchos.state, ['NEW', 'IN_USE'])))
        .get();
      if (!target) {
        return badRequest(reply, `Nenhum cartucho disponível (NEW ou em uso) para o código "${body.byCode}".`);
      }
    } else {
      target = await db.select().from(cartuchos).where(eq(cartuchos.id, cartuchoId)).get();
    }
    if (!target) return reply.code(404).send({ error: 'Cartucho não encontrado' });

    const parsed = consumoSchema.safeParse({ quantity: body.quantity, reason: body.reason });
    if (!parsed.success) {
      return badRequest(reply, parsed.error.issues[0]?.message ?? 'Payload inválido');
    }
    const quantity = parsed.data.quantity;

    const levelBefore = target.levelCurrent;
    const levelAfter = Math.max(0, levelBefore - quantity);

    await db
      .update(cartuchos)
      .set({ levelCurrent: levelAfter })
      .where(eq(cartuchos.id, target.id));

    await db.insert(cartuchoConsumo).values({
      id: newId(),
      cartuchoId: target.id,
      machineId: target.machineId ?? id,
      channel: target.channel,
      quantity,
      levelBefore,
      levelAfter,
      unit: target.unit,
      attribution: 'manual',
    });

    await db.insert(stockTransactions).values({
      id: newId(),
      itemId: target.stockItemId,
      type: 'OUT',
      quantity,
      reason: `Consumo manual de cartucho${body.reason ? `: ${body.reason}` : ''}`,
      source: SOURCE_CARTUCHO_MANUAL,
      sourceRef: target.id,
      userId: (request.user as { sub?: string } | undefined)?.sub ?? null,
      userName: (request.user as { name?: string } | undefined)?.name ?? null,
    });

    app.io.to('estoque').emit('cartuchos:updated', { machineId: id, channel: target.channel });

    return {
      success: true,
      cartuchoId: target.id,
      levelBefore,
      levelAfter,
      saldoDerivadoItem: await saldoDerivado(target.stockItemId),
    };
  });

  /**
   * Historico de consumo do cartucho. `?cartuchoId=` limita a um cartucho;
   * sem filtro, traz o consumo da maquina.
   */
  app.get('/api/machines/:id/cartuchos/consumo', {
    schema: {
      tags: ['Máquinas'],
      summary: 'Histórico de consumo de cartuchos',
      description: 'Retorna o histórico de consumo (cartucho_consumo) da máquina, opcionalmente de um cartucho.',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      querystring: {
        type: 'object',
        properties: {
          cartuchoId: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 500 },
        },
      },
    },
    preHandler: [authenticate],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const { cartuchoId, limit } = request.query as { cartuchoId?: string; limit?: number };

    const conditions = [eq(cartuchoConsumo.machineId, id)];
    if (cartuchoId) conditions.push(eq(cartuchoConsumo.cartuchoId, cartuchoId));

    const rows = await db
      .select()
      .from(cartuchoConsumo)
      .where(and(...conditions))
      .orderBy(desc(cartuchoConsumo.createdAt))
      .limit(limit ?? 100)
      .all();

    return rows.map((r) => ({
      ...r,
      quantityLabel: formatLevel(r.quantity, r.unit),
    }));
  });

  /**
   * Estoque em deposito de um item: quantos cartuchos NEW existem.
   *
   * O painel de `/tintas` usa isto para decidir se mostra "consumo manual por
   * código" (só faz sentido com código) e para dizer ao operador que há saldo.
   */
  app.get('/api/cartuchos/deposito/:stockItemId', {
    schema: {
      tags: ['Estoque'],
      summary: 'Cartuchos em depósito de um item',
      description: 'Retorna a quantidade de cartuchos NEW em depósito e o saldo derivado do item.',
      params: {
        type: 'object',
        required: ['stockItemId'],
        properties: { stockItemId: { type: 'string' } },
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { stockItemId } = request.params as { stockItemId: string };
    const item = await db.select().from(stockItems).where(eq(stockItems.id, stockItemId)).get();
    if (!item) return reply.code(404).send({ error: 'Item de estoque não encontrado' });

    const rows = await db
      .select({ n: sql<number>`COUNT(*)`, level: sql<number>`SUM(${cartuchos.levelCurrent})` })
      .from(cartuchos)
      .where(and(eq(cartuchos.stockItemId, stockItemId), eq(cartuchos.state, 'NEW')))
      .all();

    const emUso = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(cartuchos)
      .where(and(eq(cartuchos.stockItemId, stockItemId), eq(cartuchos.state, 'IN_USE')))
      .all();

    return {
      stockItemId,
      itemName: item.name,
      temCodigo: !!item.code,
      emDeposito: rows[0]?.n ?? 0,
      emUso: emUso[0]?.n ?? 0,
      saldoDerivado: await saldoDerivado(stockItemId),
    };
  });
}