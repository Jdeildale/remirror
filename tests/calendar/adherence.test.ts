import { describe, it, expect } from 'vitest';
import { computeAdherence, type AdherenceInput, type AdherenceResult } from '@main/calendar/adherence';

const MS = 60_000;
const HOUR = 60 * MS;

describe('computeAdherence', () => {
  it('returns "kept" when ≥80% of event window is covered by matched sessions', () => {
    const input: AdherenceInput = {
      event: { startMs: 0, endMs: 60 * MS, projectLabel: "Jackie's Website" },
      sessions: [
        { startMs: 5 * MS, endMs: 55 * MS, projectLabel: "Jackie's Website" },
      ],
    };
    const r = computeAdherence(input);
    expect(r.status).toBe('kept');
    expect(r.overlapMs).toBe(50 * MS);
  });

  it('returns "partial" between 20% and 80%', () => {
    const input: AdherenceInput = {
      event: { startMs: 0, endMs: 60 * MS, projectLabel: "Jackie's Website" },
      sessions: [
        { startMs: 0, endMs: 30 * MS, projectLabel: "Jackie's Website" },
      ],
    };
    const r = computeAdherence(input);
    expect(r.status).toBe('partial');
    expect(r.overlapMs).toBe(30 * MS);
  });

  it('returns "did-not-start" below 20%', () => {
    const input: AdherenceInput = {
      event: { startMs: 0, endMs: 60 * MS, projectLabel: "Jackie's Website" },
      sessions: [
        { startMs: 0, endMs: 5 * MS, projectLabel: "Jackie's Website" },
      ],
    };
    const r = computeAdherence(input);
    expect(r.status).toBe('did-not-start');
  });

  it('counts overlap only on sessions whose project matches the event', () => {
    const input: AdherenceInput = {
      event: { startMs: 0, endMs: 60 * MS, projectLabel: "Jackie's Website" },
      sessions: [
        { startMs: 0, endMs: 60 * MS, projectLabel: 'Twitter' },
      ],
    };
    const r = computeAdherence(input);
    expect(r.status).toBe('did-not-start');
    expect(r.overlapMs).toBe(0);
  });

  it('clips session ranges to the event window', () => {
    const input: AdherenceInput = {
      event: { startMs: 10 * MS, endMs: 70 * MS, projectLabel: 'X' },
      sessions: [
        { startMs: 0, endMs: 100 * MS, projectLabel: 'X' },
      ],
    };
    const r = computeAdherence(input);
    expect(r.overlapMs).toBe(60 * MS);
    expect(r.status).toBe('kept');
  });

  it('sums multiple matched session overlaps', () => {
    const input: AdherenceInput = {
      event: { startMs: 0, endMs: 60 * MS, projectLabel: 'X' },
      sessions: [
        { startMs: 0, endMs: 20 * MS, projectLabel: 'X' },
        { startMs: 30 * MS, endMs: 50 * MS, projectLabel: 'X' },
      ],
    };
    const r = computeAdherence(input);
    expect(r.overlapMs).toBe(40 * MS);
    expect(r.status).toBe('partial');
  });

  it('returns "did-not-start" when event has no mapped project', () => {
    const input: AdherenceInput = {
      event: { startMs: 0, endMs: HOUR, projectLabel: null },
      sessions: [{ startMs: 0, endMs: HOUR, projectLabel: 'Anything' }],
    };
    const r = computeAdherence(input);
    expect(r.status).toBe('did-not-start');
    expect(r.overlapMs).toBe(0);
  });
});
