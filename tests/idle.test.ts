import { describe, it, expect } from 'vitest';
import { evaluateIdle, type IdleInput, type IdleOutcome } from '@main/capture/idle';

const baseInput: Omit<IdleInput, 'idleSeconds' | 'now' | 'session'> = {
  pauseThresholdSec: 120,
  closeThresholdSec: 600,
};

const baseSession = {
  startTime: 1000,
  pausedMs: 0,
  idleStartedAt: null as number | null,
};

describe('evaluateIdle', () => {
  it('returns "active" when idleSeconds < 120', () => {
    const out = evaluateIdle({ ...baseInput, idleSeconds: 30, now: 60_000, session: { ...baseSession } });
    expect(out.action).toBe('active');
  });

  it('returns "pause" and sets idleStartedAt on first idle tick over 120s', () => {
    const out = evaluateIdle({ ...baseInput, idleSeconds: 130, now: 200_000, session: { ...baseSession } });
    expect(out.action).toBe('pause');
    expect((out as any).idleStartedAt).toBe(200_000 - 130_000); // 70_000
  });

  it('keeps "pause" without changing idleStartedAt on subsequent idle ticks', () => {
    const sess = { ...baseSession, idleStartedAt: 100_000 };
    const out = evaluateIdle({ ...baseInput, idleSeconds: 200, now: 300_000, session: sess });
    expect(out.action).toBe('pause');
    expect((out as any).idleStartedAt).toBe(100_000); // unchanged
  });

  it('returns "resume" with accrued pausedMs when input returns under 120s', () => {
    const sess = { ...baseSession, idleStartedAt: 100_000 };
    // Input returned at now=150_000, idleSeconds=10 (so idle ended at now-10s=140_000)
    const out = evaluateIdle({ ...baseInput, idleSeconds: 10, now: 150_000, session: sess });
    expect(out.action).toBe('resume');
    expect((out as any).addPausedMs).toBe(140_000 - 100_000); // 40_000
    expect((out as any).idleStartedAt).toBeNull();
  });

  it('returns "close" with end_time = idleStartedAt when idle exceeds 600s', () => {
    const sess = { ...baseSession, idleStartedAt: 100_000 };
    const out = evaluateIdle({ ...baseInput, idleSeconds: 700, now: 800_000, session: sess });
    expect(out.action).toBe('close');
    expect((out as any).closeAt).toBe(100_000);
  });

  it('closes immediately on threshold cross even if idleStartedAt was null', () => {
    // Edge case: app was restarted mid-idle, no idleStartedAt yet, but already idle 700s.
    const out = evaluateIdle({ ...baseInput, idleSeconds: 700, now: 1_000_000, session: { ...baseSession } });
    expect(out.action).toBe('close');
    expect((out as any).closeAt).toBe(1_000_000 - 700_000); // idle-start derived from idleSeconds
  });
});
