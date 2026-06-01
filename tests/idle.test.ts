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

describe('addPausedMs clamping (engine guard)', () => {
  // The engine clamps outcome.addPausedMs to ensure paused_ms never exceeds
  // session duration. This tests the clamping formula in isolation.
  // Formula: safeAdd = Math.max(0, Math.min(addPausedMs, sessionDuration - existingPausedMs))
  function clamp(addPausedMs: number, sessionDurationMs: number, existingPausedMs: number): number {
    const maxPause = Math.max(0, sessionDurationMs - existingPausedMs);
    return Math.max(0, Math.min(addPausedMs, maxPause));
  }

  it('clamps addPausedMs to session duration when value is impossibly large', () => {
    // Session is 10 minutes old, 0 already paused. evaluateIdle returned 20 minutes.
    const sessionDuration = 10 * 60_000;
    const safeAdd = clamp(20 * 60_000, sessionDuration, 0);
    expect(safeAdd).toBeLessThanOrEqual(sessionDuration);
    expect(safeAdd).toBe(sessionDuration); // capped at 10 min
  });

  it('returns zero when paused_ms already equals session duration', () => {
    const sessionDuration = 10 * 60_000;
    const safeAdd = clamp(5 * 60_000, sessionDuration, sessionDuration);
    expect(safeAdd).toBe(0);
  });

  it('returns the actual value when it is within bounds', () => {
    const safeAdd = clamp(2 * 60_000, 10 * 60_000, 3 * 60_000);
    // maxPause = 10 - 3 = 7 min; addPausedMs = 2 min → 2 min is safe
    expect(safeAdd).toBe(2 * 60_000);
  });

  it('clamps negative addPausedMs to zero', () => {
    const safeAdd = clamp(-1000, 10 * 60_000, 0);
    expect(safeAdd).toBe(0);
  });
});
