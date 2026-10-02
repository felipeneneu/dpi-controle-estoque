import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { cartuchos, stockItems } from '../db/schema.js';

/**
 * Saldo derivado de consumivel (ADR-052 / BR-052).
 *
 * Para item que tem cartucho, a verdade do saldo e
 * `SUM(level_current)` em `NEW | IN_USE` - o cartucho em deposito conta, o
 * descartado nao. `stock_items.currentQuantity` passa a ser o agregado legado e
 * nao pode ser usado para esses itens.
 */

/** Estados que contam para saldo: em deposito (NEW) ou na maquina (IN_USE). */
export const BALANCE_STATES = ['NEW', 'IN_USE'] as const;

/**
 * Saldo derivado do item, ou `null` quando o item nao e rastreado por cartucho.
 *
 * A distincao `null` vs `0` e load-bearing:
 * - `null`  = "sem cartucho" -> caller deve ler `currentQuantity` (folha, solvente, resma);
 * - `0`     = "tem cartucho e a soma e zero" -> item realmente esgotado.
 *
 * Sem ela, folha e solvente seriam reportados como "Tinta C esgotada" pelo alerta
 * global, porque `SUM` de conjunto vazio devolve 0 em SQL.
 */
export async function saldoDerivado(stockItemId: string): Promise<number | null> {
  // Uma consulta, dois numeros: `n` diz se o item e rastreado por cartucho e
  // `total` e o saldo. Filtrar por estado no WHERE antes de contar nao
  // distinguishia "sem cartucho" de "cartuchos, mas todos descartados".
  const rows = await db
    .select({
      n: sql<number>`COUNT(*)`,
      total: sql<number>`COALESCE(SUM(CASE WHEN ${cartuchos.state} IN ('NEW', 'IN_USE') THEN ${cartuchos.levelCurrent} ELSE 0 END), 0)`,
    })
    .from(cartuchos)
    .where(eq(cartuchos.stockItemId, stockItemId))
    .all();

  if (!rows[0] || rows[0].n === 0) return null;
  return rows[0].total;
}

/**
 * Saldo derivado de varios itens em uma consulta.
 *
 * Mesma semantica de `saldoDerivado`, em lote: entra no mapa **todo item que tem
 * ao menos um cartucho** (qualquer estado), com a soma de `NEW | IN_USE`. Item
 * com todos os cartuchos descartados entra com `0`; item sem nenhum cartucho
 * **nao** entra, para o caller distinguir "nao rastreado" de "zerado" sem uma
 * segunda consulta por item.
 */
export async function saldosDerivados(
  stockItemIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (stockItemIds.length === 0) return out;

  const rows = await db
    .select({
      stockItemId: cartuchos.stockItemId,
      total: sql<number>`COALESCE(SUM(CASE WHEN ${cartuchos.state} IN ('NEW', 'IN_USE') THEN ${cartuchos.levelCurrent} ELSE 0 END), 0)`,
    })
    .from(cartuchos)
    .where(inArray(cartuchos.stockItemId, stockItemIds))
    .groupBy(cartuchos.stockItemId);

  for (const row of rows) out.set(row.stockItemId, row.total ?? 0);
  return out;
}

/**
 * Quantos cartuchos do item estao em deposito prontos para uso.
 *
 * Exige `state = NEW` **e** `location = deposito`: cartucho `NEW` cujo
 * `location` aponta para maquina e residuo de link errado e nao pode
 * satisfazer o alerta de reposicao. O gate BR-054 depende disso: um cartucho
 * `NEW` que o operador "movou" para a bancada sem trocar nao e estoque.
 */
export async function cartuchosEmDeposito(stockItemId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(cartuchos)
    .where(
      and(
        eq(cartuchos.stockItemId, stockItemId),
        eq(cartuchos.state, 'NEW'),
        eq(cartuchos.location, 'deposito'),
      ),
    );
  return rows[0]?.n ?? 0;
}

/** Item tem algum cartucho cadastrado (qualquer estado)? Usado pelo cutover. */
export async function itemTemCartuchos(stockItemId: string): Promise<boolean> {
  const row = await db
    .select({ id: cartuchos.id })
    .from(cartuchos)
    .where(eq(cartuchos.stockItemId, stockItemId))
    .get();
  return !!row;
}

export class CodigoAmbíguoError extends Error {
  readonly codigo: string;
  readonly itemIds: string[];
  constructor(codigo: string, itemIds: string[]) {
    super(
      `Codigo "${codigo}" e ambiguo: ${itemIds.length} itens do estoque usam esse mesmo codigo. ` +
        `Desambigue no cadastro antes de lancar.`,
    );
    this.name = 'CodigoAmbíguoError';
    this.codigo = codigo;
    this.itemIds = itemIds;
  }
}

export class CodigoNaoEncontradoError extends Error {
  readonly codigo: string;
  constructor(codigo: string) {
    super(`Codigo "${codigo}" nao encontrado no estoque.`);
    this.name = 'CodigoNaoEncontradoError';
    this.codigo = codigo;
  }
}

/**
 * Resolve o item a partir do codigo que o operador digitou.
 *
 * **Recusa adivinhar.** O seed de midia HP ja grava codigo repetido entre larguras
 * (`011983` em RP420 0,76m e 1,52m; `0229` em DE530 0,76m e 1,52m), entao um
 * `LIMIT 1` aqui levaria o operador a dar baixa no item errado - e o principio da
 * BR-010: matcher nao pode falhar em silencio. Codigo com mais de um candidato
 * vira `CodigoAmbíguoError`, e o dialogo mostra os candidatos para o operador
 * escolher. Nao ha indice UNIQUE em `stock_items.code` pelo mesmo motivo: ele
 * reprovaria a migration em qualquer banco semeado.
 */
export async function resolveItemByCode(codigo: string): Promise<string> {
  const trimmed = codigo.trim();
  if (!trimmed) throw new CodigoNaoEncontradoError(codigo);

  const rows = await db
    .select({ id: stockItems.id, name: stockItems.name })
    .from(stockItems)
    .where(eq(stockItems.code, trimmed))
    .all();

  if (rows.length === 0) throw new CodigoNaoEncontradoError(trimmed);
  if (rows.length > 1) {
    throw new CodigoAmbíguoError(trimmed, rows.map((r) => r.id));
  }
  return rows[0]!.id;
}

/** Candidatos de um codigo ambiguo, para o dialogo pedir desambiguacao ao operador. */
export async function candidatosPorCodigo(
  codigo: string,
): Promise<{ id: string; name: string }[]> {
  return await db
    .select({ id: stockItems.id, name: stockItems.name })
    .from(stockItems)
    .where(eq(stockItems.code, codigo.trim()))
    .all();
}