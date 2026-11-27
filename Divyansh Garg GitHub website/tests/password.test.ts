// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../lib/password';

const PASSWORD = 'unit-test-password';

describe('password hashing', () => {
  it('stores a salted hex hash and verifies the correct password', () => {
    const stored = hashPassword(PASSWORD);

    expect(stored).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
    expect(verifyPassword(PASSWORD, stored)).toBe(true);
  });

  it('rejects an incorrect password', () => {
    const stored = hashPassword(PASSWORD);
    expect(verifyPassword('a-different-password', stored)).toBe(false);
  });

  it('produces different hashes for the same password', () => {
    const first = hashPassword(PASSWORD);
    const second = hashPassword(PASSWORD);

    expect(first).not.toBe(second);
    expect(verifyPassword(PASSWORD, first)).toBe(true);
    expect(verifyPassword(PASSWORD, second)).toBe(true);
  });

  it('rejects malformed stored values', () => {
    expect(verifyPassword(PASSWORD, '')).toBe(false);
    expect(verifyPassword(PASSWORD, 'only-a-salt')).toBe(false);
    expect(verifyPassword(PASSWORD, 'salt:not-a-hex-hash')).toBe(false);
  });
});
