import { describe, expect, it } from 'vitest';
import { CURRENTLY_EDUCATION, CURRENTLY_FOUNDER, CURRENTLY_INTERNSHIP, CURRENTLY_LINES, deriveCurrentlyLines } from '../lib/identity-roles';

describe('deriveCurrentlyLines', () => {
  it('uses the exact three requested lines in the requested order', () => {
    expect(deriveCurrentlyLines()).toEqual([
      CURRENTLY_EDUCATION,
      CURRENTLY_INTERNSHIP,
      CURRENTLY_FOUNDER,
    ]);
  });

  it('never introduces a former-title label', () => {
    const lines = deriveCurrentlyLines();
    expect(lines.join(' ')).not.toMatch(/former|research intern/i);
  });

  it('is stable regardless of CMS records', () => {
    expect(deriveCurrentlyLines()).toEqual([...CURRENTLY_LINES]);
  });
});
