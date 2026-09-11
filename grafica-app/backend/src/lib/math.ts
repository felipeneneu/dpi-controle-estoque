import Big from 'big.js';

Big.DP = 10;
Big.RM = Big.roundHalfUp;

/**
 * Calcula o metro linear consumido a partir da área do RIP e largura da bobina.
 * Garante precisão decimal estrita eliminando anomalias do ponto flutuante do JS.
 * 
 * @param areaM2 - Área em m² (fornecida pelo HP via accounting.xls)
 * @param widthM - Largura da bobina em metros (ex: 1.06 para 1,06m)
 * @returns Metro linear consumido, arredondado para 3 casas decimais
 */
export function divideAreaToLength(areaM2: number, widthM: number): number {
  if (widthM <= 0) {
    throw new Error('A largura da bobina física deve ser maior que zero.');
  }
  
  const area = new Big(areaM2);
  const width = new Big(widthM);
  
  return area.div(width).round(3, Big.roundHalfUp).toNumber();
}

/**
 * Subtrai quantidade do estoque garantindo que não fique negativo.
 * Utiliza big.js para precisão decimal.
 * 
 * @param current - Quantidade atual em estoque
 * @param deduction - Quantidade a ser deduzida
 * @returns Nova quantidade em estoque (mínimo 0)
 */
export function subtractStock(current: number, deduction: number): number {
  const result = new Big(current).minus(deduction);
  return Math.max(0, result.toNumber());
}

/**
 * Soma um array de valores com precisão decimal.
 * Evita erros de acumulação de ponto flutuante.
 * 
 * @param values - Array de valores para somar
 * @returns Soma total com precisão
 */
export function sumPrecise(values: number[]): number {
  return values.reduce(
    (acc, val) => new Big(acc).plus(val),
    new Big(0)
  ).toNumber();
}

/**
 * Arredonda um valor para o número especificado de casas decimais.
 * Utiliza arredondamento comercial (half-up).
 * 
 * @param value - Valor para arredondar
 * @param decimals - Número de casas decimais
 * @returns Valor arredondado
 */
export function toPrecision(value: number, decimals: number): number {
  return new Big(value).round(decimals, Big.roundHalfUp).toNumber();
}

/**
 * Multiplica valores com precisão decimal.
 * Útil para cálculos como: height_mm × pages × units
 * 
 * @param values - Valores para multiplicar
 * @returns Produto com precisão
 */
export function multiplyPrecise(...values: number[]): number {
  return values.reduce(
    (acc, val) => new Big(acc).times(val),
    new Big(1)
  ).toNumber();
}
