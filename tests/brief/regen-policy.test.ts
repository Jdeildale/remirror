import { describe, it, expect } from 'vitest';
import { canRegenerate, regenStatus, USER_REGEN_CAP } from '@main/brief/regen-policy';

describe('canRegenerate / regenStatus', () => {
  it('USER_REGEN_CAP is 2', () => {
    expect(USER_REGEN_CAP).toBe(2);
  });

  it('canRegenerate is true at generation_count = 1 (initial only)', () => {
    expect(canRegenerate(1)).toBe(true);
  });

  it('canRegenerate is true at generation_count = 2 (one regen used)', () => {
    expect(canRegenerate(2)).toBe(true);
  });

  it('canRegenerate is false at generation_count = 3 (two regens used)', () => {
    expect(canRegenerate(3)).toBe(false);
  });

  it('canRegenerate is false at generation_count > 3', () => {
    expect(canRegenerate(4)).toBe(false);
    expect(canRegenerate(99)).toBe(false);
  });

  it('regenStatus reports used and cap', () => {
    expect(regenStatus(1)).toEqual({ used: 0, cap: 2, locked: false });
    expect(regenStatus(2)).toEqual({ used: 1, cap: 2, locked: false });
    expect(regenStatus(3)).toEqual({ used: 2, cap: 2, locked: true });
    expect(regenStatus(4)).toEqual({ used: 2, cap: 2, locked: true });
  });
});
