import { describe, it, expect } from 'vitest';
import {
  formatLevel,
  levelPct,
  parseCartridgeUnit,
  isValidLevel,
  isValidCapacity,
  toCartridgeLevel,
} from '../../src/lib/ink-units.js';

/**
 * BR-052: a conversao de nivel e a formatacao sustentam o limiar de 15% do
 * alerta de reposicao. O caso que segura o sistema inteiro e `levelPct` devolvendo
 * `null` (nao `0`) quando a capacidade nao e conhecida - se devolvesse `0`, todo
 * cartucho recem-cadastrado dispararia "repor tinta".
 */

describe('ink-units: unidade de nivel', () => {
  it('normaliza ml e pct/%', () => {
    expect(parseCartridgeUnit('ml')).toBe('ml');
    expect(parseCartridgeUnit('ML')).toBe('ml');
    expect(parseCartridgeUnit('pct')).toBe('pct');
    expect(parseCartridgeUnit('%')).toBe('pct');
    expect(parseCartridgeUnit('Pct')).toBe('pct');
  });

  it('rejeita unidade desconhecida em vez de assumir ml', () => {
    expect(parseCartridgeUnit('cc')).toBeNull();
    expect(parseCartridgeUnit('')).toBeNull();
    expect(parseCartridgeUnit(null)).toBeNull();
    expect(parseCartridgeUnit(undefined)).toBeNull();
  });
});

describe('ink-units: formatLevel', () => {
  it('formata pct como inteiro com sinal (leitura de painel)', () => {
    expect(formatLevel(15, 'pct')).toBe('15%');
    expect(formatLevel(14.6, 'pct')).toBe('15%');
    expect(formatLevel(100, 'pct')).toBe('100%');
  });

  it('formata ml com uma casa', () => {
    expect(formatLevel(775, 'ml')).toBe('775 ml');
    // Nao arredonda 116,25 para 116,3: a tela diria que ha mais tinta do que ha.
    expect(formatLevel(116.25, 'ml')).toBe('116,25 ml');
    expect(formatLevel(193.75, 'ml')).toBe('193,75 ml');
    expect(formatLevel(100.1, 'ml')).toBe('100,1 ml');
    expect(formatLevel(0, 'ml')).toBe('0 ml');
  });

  it('nunca imprime NaN ou Infinity num alerta', () => {
    expect(formatLevel(Number.NaN, 'ml')).toBe('--');
    expect(formatLevel(Number.POSITIVE_INFINITY, 'pct')).toBe('--');
    expect(formatLevel(null, 'pct')).toBe('--');
    expect(formatLevel(undefined, 'ml')).toBe('--');
  });

  it('cai para ml quando a unidade nao e reconhecida', () => {
    expect(formatLevel(10, 'cc')).toBe('10 ml');
  });
});

describe('ink-units: levelPct', () => {
  it('calcula percentual de carga', () => {
    expect(levelPct(775, 775)).toBe(100);
    expect(levelPct(116.25, 775)).toBeCloseTo(15, 10);
  });

  it('devolve null sem capacidade declarada (nao 0)', () => {
    expect(levelPct(100, null)).toBeNull();
    expect(levelPct(100, undefined)).toBeNull();
  });

  it('devolve null com capacidade zero ou negativa', () => {
    expect(levelPct(100, 0)).toBeNull();
    expect(levelPct(100, -775)).toBeNull();
  });

  it('devolve null para nivel nao finito em vez de propagar NaN', () => {
    expect(levelPct(Number.NaN, 775)).toBeNull();
    expect(levelPct(100, Number.NaN)).toBeNull();
    expect(levelPct(Number.POSITIVE_INFINITY, 775)).toBeNull();
  });

  it('classifica corretamente no limiar de 15% (BR-054)', () => {
    // 775 * 0.15 = 116.25
    expect(levelPct(116.25, 775)).toBeLessThanOrEqual(15);
    expect(levelPct(116.26, 775)).toBeGreaterThan(15);
  });
});

describe('ink-units: validacao de nivel (regra R-013 aplicada a TS)', () => {
  it('rejeita NaN e Infinity, que passariam em comparacao ingenua', () => {
    expect(isValidLevel(NaN)).toBe(false);
    expect(isValidLevel(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidLevel(Number.NEGATIVE_INFINITY)).toBe(false);
    expect(isValidLevel(0)).toBe(true);
    expect(isValidLevel(775)).toBe(true);
  });

  it('capacidade precisa ser positiva alem de finita', () => {
    expect(isValidCapacity(775)).toBe(true);
    expect(isValidCapacity(0)).toBe(false);
    expect(isValidCapacity(-1)).toBe(false);
    expect(isValidCapacity(NaN)).toBe(false);
  });

  it('toCartridgeLevel recusa valor negativo ou nao finito', () => {
    expect(toCartridgeLevel(116.25, 'ml')).toBe(116.25);
    expect(toCartridgeLevel(-1, 'ml')).toBeNull();
    expect(toCartridgeLevel(NaN, 'ml')).toBeNull();
    expect(toCartridgeLevel(10, 'cc')).toBeNull();
  });
});