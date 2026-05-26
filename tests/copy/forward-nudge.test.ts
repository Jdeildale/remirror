import { describe, it, expect } from 'vitest';
import { generateForwardNudge, type NudgeContext } from '@main/copy/forward-nudge';

describe('generateForwardNudge', () => {
  it('uses goal-progress pattern when goal is set and behind pace', () => {
    const ctx: NudgeContext = {
      goal: { text: 'Ship the Oracle dashboard', projectLabel: 'Oracle' },
      goalProgressMs: 2 * 3600_000 + 14 * 60_000,
      goalTargetMs: 8 * 3600_000,
      topProjectToday: { label: 'Oracle', returnCount: 3 },
      anySessionsToday: true,
    };
    const result = generateForwardNudge(ctx);
    expect(result).not.toBeNull();
    expect(result!).toContain('Ship the Oracle dashboard');
    expect(result!).toContain('2h 14m');
    expect(result!).toContain('close the gap');
  });

  it('uses on-pace message when goal is set and on track', () => {
    const ctx: NudgeContext = {
      goal: { text: 'Ship Oracle', projectLabel: 'Oracle' },
      goalProgressMs: 7 * 3600_000,
      goalTargetMs: 8 * 3600_000,
      topProjectToday: null,
      anySessionsToday: true,
    };
    const result = generateForwardNudge(ctx);
    expect(result).toContain('tracking ahead');
  });

  it('falls back to "where your brain wants to land" when no goal', () => {
    const ctx: NudgeContext = {
      goal: null,
      goalProgressMs: 0,
      goalTargetMs: 0,
      topProjectToday: { label: "Jackie's Website", returnCount: 4 },
      anySessionsToday: true,
    };
    const result = generateForwardNudge(ctx);
    expect(result).toContain("Jackie's Website");
    expect(result).toContain('4 times');
    expect(result).toContain('your brain keeps wanting to land');
  });

  it('returns null when no goal and no sessions yet', () => {
    const ctx: NudgeContext = {
      goal: null,
      goalProgressMs: 0,
      goalTargetMs: 0,
      topProjectToday: null,
      anySessionsToday: false,
    };
    expect(generateForwardNudge(ctx)).toBeNull();
  });

  it('contains no banned vocabulary', () => {
    const ctx: NudgeContext = {
      goal: { text: 'Ship X', projectLabel: 'X' },
      goalProgressMs: 30 * 60_000,
      goalTargetMs: 10 * 3600_000,
      topProjectToday: null,
      anySessionsToday: true,
    };
    const result = generateForwardNudge(ctx);
    const banned = ['should', 'failed', 'missed', 'wasted', 'drifted', 'off-track'];
    for (const word of banned) {
      expect(result!.toLowerCase()).not.toContain(word);
    }
  });
});
