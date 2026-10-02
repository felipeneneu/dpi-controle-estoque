/**
 * Constantes de consumivel da HP Latex 330 (ADR-052 / BR-052).
 *
 * Movido de `telemetry.ts` para que o sync de cartucho, o agente e a UI leiam a
 * **mesma** tabela de canais e print numbers. Antes o `INK_COLORS` vivia dentro do
 * scraper, entao qualquer outro consumidor do canal precisava duplicar a lista.
 *
 * Capacidade: os cartuchos OEM desta serie sao de 775 ml. A pagina de device web da
 * HP expoe apenas o **restante** em ml, entao a capacidade nao e lida da pagina:
 * e uma constante do parque instalado, declarada no cadastro do cartucho como
 * `level_capacity`. (Ruling R-001: o plano previa ler a capacidade da pagina;
 * o scraper em `telemetry.ts:117-127` mostra que ela ja era fixa em 775.)
 */

/** Capacidade nominal de um cartucho de tinta HP desta serie, em ml. */
export const DEFAULT_INK_CAPACITY_ML = 775;

/** Unidade de nivel do cartucho de tinta HP. */
export const HP_INK_UNIT = 'ml';

/** Canais da Latex 330 na ordem em que aparecem no painel. */
export const HP_INK_CHANNELS = ['C', 'LC', 'M', 'LM', 'Y', 'K', 'OP'] as const;

export type HpInkChannel = (typeof HP_INK_CHANNELS)[number];

export interface HpInkChannelSpec {
  /** Canal do slot fisico na maquina. */
  channel: HpInkChannel;
  /** Codigo OEM impresso no cartucho; e o que o operador digita para identificar. */
  partNumber: string;
  /** SKU logico do item em `stock_items.name`. */
  sku: string;
  /** Rotulo curto para a UI. */
  label: string;
}

/**
 * Fonte unica de canal <-> SKU <-> print number.
 *
 * `OP` (Optimizer) e exception: o job entrega `inkOptimizerMl`, que e volume
 * ingerido, nao tinta depositada no canal. Por isso o canal `OP` **nao** recebe
 * cartucho com nivel reconciliado por telemetria - ver ADR-052.
 */
export const HP_INK_CHANNELS_SPEC: readonly HpInkChannelSpec[] = [
  { channel: 'C', partNumber: 'CZ683A', sku: 'hp_tinta-cyan', label: 'Ciano' },
  { channel: 'LC', partNumber: 'CZ686A', sku: 'hp_tinta-light-cyan', label: 'Ciano Claro' },
  { channel: 'M', partNumber: 'CZ684A', sku: 'hp_tinta-magenta', label: 'Magenta' },
  { channel: 'LM', partNumber: 'CZ687A', sku: 'hp_tinta-light-magenta', label: 'Magenta Claro' },
  { channel: 'Y', partNumber: 'CZ685A', sku: 'hp_tinta-yellow', label: 'Amarelo' },
  { channel: 'K', partNumber: 'CZ682A', sku: 'hp_tinta-black', label: 'Preto' },
  { channel: 'OP', partNumber: 'CZ706A', sku: 'hp_tinta-optimizer', label: 'Optimizer' },
];

/** SKU -> canal. Chave de leitura do sync (o scraper devolve SKU). */
export const HP_SKU_TO_CHANNEL: Readonly<Record<string, HpInkChannel>> = Object.freeze(
  Object.fromEntries(HP_INK_CHANNELS_SPEC.map((s) => [s.sku, s.channel])),
);

/** Print number -> canal. Chave de leitura da pagina de device web. */
export const HP_PARTNUMBER_TO_CHANNEL: Readonly<Record<string, HpInkChannel>> = Object.freeze(
  Object.fromEntries(HP_INK_CHANNELS_SPEC.map((s) => [s.partNumber, s.channel])),
);

/** Canais cujo nivel e ml de tinta depositada no canal. */
export const HP_INKED_CHANNELS: readonly HpInkChannel[] = HP_INK_CHANNELS.filter((c) => c !== 'OP');

export function hpSpecForChannel(channel: string): HpInkChannelSpec | null {
  return HP_INK_CHANNELS_SPEC.find((s) => s.channel === channel) ?? null;
}

export function hpSpecForSku(sku: string): HpInkChannelSpec | null {
  return HP_INK_CHANNELS_SPEC.find((s) => s.sku === sku) ?? null;
}

export function hpSpecForPartNumber(partNumber: string): HpInkChannelSpec | null {
  return HP_INK_CHANNELS_SPEC.find((s) => s.partNumber === partNumber) ?? null;
}