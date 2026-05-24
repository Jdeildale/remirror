export interface IdleInput {
  idleSeconds: number;          // from powerMonitor.getSystemIdleTime()
  now: number;                  // Date.now()
  pauseThresholdSec: number;    // 120
  closeThresholdSec: number;    // 600
  session: {
    startTime: number;
    pausedMs: number;
    idleStartedAt: number | null;
  };
}

export type IdleOutcome =
  | { action: 'active' }
  | { action: 'pause'; idleStartedAt: number }
  | { action: 'resume'; addPausedMs: number; idleStartedAt: null }
  | { action: 'close'; closeAt: number };

export function evaluateIdle(input: IdleInput): IdleOutcome {
  const { idleSeconds, now, pauseThresholdSec, closeThresholdSec, session } = input;
  const idleMs = idleSeconds * 1000;
  const derivedIdleStartedAt = session.idleStartedAt ?? (now - idleMs);

  if (idleSeconds >= closeThresholdSec) {
    return { action: 'close', closeAt: derivedIdleStartedAt };
  }

  if (idleSeconds >= pauseThresholdSec) {
    if (session.idleStartedAt === null) {
      return { action: 'pause', idleStartedAt: derivedIdleStartedAt };
    }
    return { action: 'pause', idleStartedAt: session.idleStartedAt };
  }

  // Active
  if (session.idleStartedAt !== null) {
    // We were paused; activity resumed.
    const pauseEnd = now - idleMs; // when input actually came back
    return {
      action: 'resume',
      addPausedMs: pauseEnd - session.idleStartedAt,
      idleStartedAt: null,
    };
  }
  return { action: 'active' };
}
