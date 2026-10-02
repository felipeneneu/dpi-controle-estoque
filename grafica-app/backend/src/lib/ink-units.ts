/**
 * Unidades de nivel de consumivel (ADR-052 / BR-052).
 *
 * Cartucho usa duas unidades diferentes: tinta HP em `ml`, toner Konica em `pct`.
 * A unidade e declarada **por cartucho**, nao por item, porque a capacidade e o
 * limite de aviso variam por tipo de parque instalado.
 */

/** Unidade de nivel aceita em `cartuchos.unit`. */
export type CartridgeUnit = 'ml' | 'pct';

const UNITS: readonly CartridgeUnit[] = ['ml', 'pct'];

/**
 * Normaliza texto digitado pelo operador para a unidade canonica.
 * Aceita ml/mL/ML e pct/%/PC.
 */
export function parseCartridgeUnit(value: string | null | undefined): CartridgeUnit | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v === 'ml') return 'ml';
  if (v === 'pct' || v === '%') return 'pct';
  return null;
}

export function isCartridgeUnit(value: unknown): value is CartridgeUnit {
  return typeof value === 'string' && (UNITS as readonly string[]).includes(value);
}

/**
 * Formata nivel para exibicao/alert.
 *
 * `pct` mostra inteiro com sinal de %, porque e leitura de painel: `15%`.
 *
 * `ml` mostra ate duas casas, com os zeros a direita removidos: `775 ml`, nao
 * `775,00 ml`. Uma casa so (o draft da Task 4) era pior em dois jeitos: enche a
 * tela de `775,0 ml` e **arredonda para cima** - a telemetria entrega 116,25 ml e
 * a tela dizia 116,3, ou seja, o operador via mais tinta do que existe. Duas
 * casas preservam o valor que o sistema de fato guarda na coluna `real`.
 *
 * Separador decimal em virgula: os unicos consumidores sao alertas em pt-BR
 * (WhatsApp/e-mail) e campos de exibicao que a UI mostra como veio.
 *
 * `NaN`/`Infinity` viram texto de erro em vez de "NaN ml" no meio de um alerta.
 */
export function formatLevel(value: number | null | undefined, unit: CartridgeUnit | string | null | undefined): string {
  if (value === null || value === undefined) return '--';
  if (!Number.isFinite(value)) return '--';
  const u = parseCartridgeUnit(typeof unit === 'string' ? unit : null) ?? 'ml';
  if (u === 'pct') return `${Math.round(value)}%`;
  const trimmed = value.toFixed(2).replace(/\.?0+$/, '');
  return `${trimmed.replace('.', ',')} ml`;
}

/**
 * Percentual de carga do cartucho: `levelCurrent / levelCapacity * 100`.
 *
 * Devolve `null` quando nao da para calcular - sem capacidade declarada, ou com
 * valores nao finitos. O `null` e portador de sentido: o alerta de reposicao pula
 * o cartucho em vez de tratar "capacidade desconhecida" como 0% (que dispararia
 * alerta falso para todo cartucho recem-cadastrado).
 */
export function levelPct(levelCurrent: number | null | undefined, levelCapacity: number | null | undefined): number | null {
  if (levelCurrent === null || levelCurrent === undefined) return null;
  if (levelCapacity === null || levelCapacity === undefined) return null;
  if (!Number.isFinite(levelCurrent) || !Number.isFinite(levelCapacity)) return null;
  if (levelCapacity <= 0) return null;
  return (levelCurrent / levelCapacity) * 100;
}

/**
 * Valida um nivel a ser gravado em `cartuchos`.
 *
 * `NaN <= 0` e `NaN > 0` sao **ambos** `false`, entao validar so com comparacao
 * deixa `NaN` passar e grava geometria quebrada na coluna `real` (regra R-013 do
 * repo, aplicada ao dominio TS). Aqui a comparacao vem sempre acompanhada de
 * `Number.isFinite`.
 */
export function isValidLevel(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Mesma checagem para capacidade declarada. */
export function isValidCapacity(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** Converte ml para a unidade do cartucho, recusando troca sem sentido (ml -> pct). */
export function toCartridgeLevel(valueMl: number, unit: CartridgeUnit | string): number | null {
  const u = parseCartridgeUnit(unit);
  if (!u) return null;
  if (!isValidLevel(valueMl) || valueMl < 0) return null;
  return valueMl;
}