export interface CalendarEventSlice {
  startMs: number;
  endMs: number;
  projectLabel: string | null;
}

export interface SessionSlice {
  startMs: number;
  endMs: number;
  projectLabel: string;
}

export interface AdherenceInput {
  event: CalendarEventSlice;
  sessions: SessionSlice[];
}

export type AdherenceStatus = 'kept' | 'partial' | 'did-not-start';

export interface AdherenceResult {
  status: AdherenceStatus;
  overlapMs: number;
  eventDurationMs: number;
  ratio: number;
}

const KEPT_THRESHOLD = 0.80;
const PARTIAL_THRESHOLD = 0.20;

export function computeAdherence(input: AdherenceInput): AdherenceResult {
  const eventDurationMs = Math.max(0, input.event.endMs - input.event.startMs);
  if (!input.event.projectLabel || eventDurationMs === 0) {
    return { status: 'did-not-start', overlapMs: 0, eventDurationMs, ratio: 0 };
  }

  let overlapMs = 0;
  for (const s of input.sessions) {
    if (s.projectLabel !== input.event.projectLabel) continue;
    const startOverlap = Math.max(s.startMs, input.event.startMs);
    const endOverlap = Math.min(s.endMs, input.event.endMs);
    const overlap = Math.max(0, endOverlap - startOverlap);
    overlapMs += overlap;
  }

  const ratio = overlapMs / eventDurationMs;
  let status: AdherenceStatus = 'did-not-start';
  if (ratio >= KEPT_THRESHOLD) status = 'kept';
  else if (ratio >= PARTIAL_THRESHOLD) status = 'partial';

  return { status, overlapMs, eventDurationMs, ratio };
}
