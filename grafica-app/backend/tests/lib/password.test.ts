import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/lib/password.js';

describe('password hashing', () => {
  it('hashes and verifies a correct password', () => {
    const stored = hashPassword('super-secret');
    expect(stored).toContain(':');
    expect(verifyPassword('super-secret', stored)).toBe(true);
  });

  it('rejects a wrong password', () => {
    const stored = hashPassword('right-password');
    expect(verifyPassword('wrong-password', stored)).toBe(false);
  });

  it('produces unique salts per call', () => {
    const a = hashPassword('same');
    const b = hashPassword('same');
    expect(a).not.toBe(b);
  });

  it('returns false for malformed stored values', () => {
    expect(verifyPassword('x', '')).toBe(false);
    expect(verifyPassword('x', 'no-separator')).toBe(false);
  });
});
