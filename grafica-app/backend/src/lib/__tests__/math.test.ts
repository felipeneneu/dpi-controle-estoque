import { describe, it, expect } from 'vitest';
import {
  divideAreaToLength,
  subtractStock,
  sumPrecise,
  toPrecision,
  multiplyPrecise,
} from '../math.js';

describe('divideAreaToLength', () => {
  it('should calculate 3.5819 / 1.60 = 2.239 (not 2.238687...)', () => {
    const result = divideAreaToLength(3.5819, 1.60);
    expect(result).toBe(2.239);
  });

  it('should calculate 4.9426 / 1.06 = 4.663', () => {
    const result = divideAreaToLength(4.9426, 1.06);
    expect(result).toBe(4.663);
  });

  it('should calculate 1.0 / 1.0 = 1.0', () => {
    const result = divideAreaToLength(1.0, 1.0);
    expect(result).toBe(1.0);
  });

  it('should calculate 0.5 / 0.5 = 1.0', () => {
    const result = divideAreaToLength(0.5, 0.5);
    expect(result).toBe(1.0);
  });

  it('should throw for width <= 0', () => {
    expect(() => divideAreaToLength(1, 0)).toThrow('Largura da bobina deve ser maior que zero');
    expect(() => divideAreaToLength(1, -1)).toThrow('Largura da bobina deve ser maior que zero');
  });

  it('should handle edge case with small values', () => {
    const result = divideAreaToLength(0.001, 0.001);
    expect(result).toBe(1.0);
  });
});

describe('subtractStock', () => {
  it('should subtract precisely', () => {
    const result = subtractStock(10.5, 3.2);
    expect(result).toBe(7.3);
  });

  it('should not go below 0', () => {
    const result = subtractStock(2, 5);
    expect(result).toBe(0);
  });

  it('should handle exact subtraction', () => {
    const result = subtractStock(10, 10);
    expect(result).toBe(0);
  });

  it('should handle decimal subtraction', () => {
    const result = subtractStock(1.1, 0.1);
    expect(result).toBe(1.0);
  });
});

describe('sumPrecise', () => {
  it('should sum array of numbers', () => {
    const result = sumPrecise([1, 2, 3, 4, 5]);
    expect(result).toBe(15);
  });

  it('should sum decimal numbers precisely', () => {
    const result = sumPrecise([0.1, 0.2, 0.3]);
    expect(result).toBe(0.6);
  });

  it('should handle empty array', () => {
    const result = sumPrecise([]);
    expect(result).toBe(0);
  });

  it('should handle single element', () => {
    const result = sumPrecise([5]);
    expect(result).toBe(5);
  });

  it('should handle negative numbers', () => {
    const result = sumPrecise([10, -3, 2]);
    expect(result).toBe(9);
  });
});

describe('toPrecision', () => {
  it('should round to 3 decimal places', () => {
    const result = toPrecision(2.2386875000000003, 3);
    expect(result).toBe(2.239);
  });

  it('should round to 2 decimal places', () => {
    const result = toPrecision(3.456, 2);
    expect(result).toBe(3.46);
  });

  it('should round to 0 decimal places', () => {
    const result = toPrecision(3.7, 0);
    expect(result).toBe(4);
  });

  it('should handle half-up rounding', () => {
    const result = toPrecision(2.5, 0);
    expect(result).toBe(3);
  });

  it('should handle already rounded numbers', () => {
    const result = toPrecision(2.0, 3);
    expect(result).toBe(2.0);
  });
});

describe('multiplyPrecise', () => {
  it('should multiply two numbers', () => {
    const result = multiplyPrecise(2, 3);
    expect(result).toBe(6);
  });

  it('should multiply multiple numbers', () => {
    const result = multiplyPrecise(2, 3, 4);
    expect(result).toBe(24);
  });

  it('should handle decimals', () => {
    const result = multiplyPrecise(0.1, 0.2);
    expect(result).toBe(0.02);
  });

  it('should handle Mimaki calculation: 1600 * 1 * 1 / 1000', () => {
    const result = toPrecision(multiplyPrecise(1600, 1, 1) / 1000, 3);
    expect(result).toBe(1.6);
  });
});
