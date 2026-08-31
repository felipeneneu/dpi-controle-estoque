import { describe, it, expect } from 'vitest';
import { newId } from '../../src/lib/ids.js';

describe('newId', () => {
  it('returns a non-empty string', () => {
    expect(typeof newId()).toBe('string');
    expect(newId().length).toBeGreaterThan(0);
  });

  it('returns unique ids', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId()));
    expect(ids.size).toBe(1000);
  });
});
