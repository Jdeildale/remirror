import { describe, it, expect } from 'vitest';
import { generateTruthHeadline, type DayShape } from '@main/copy/truth-headline';

describe('generateTruthHeadline', () => {
  it('produces a headline with focused + elsewhere + longest', () => {
    const shape: DayShape = {
      focusedMs: 3 * 3600_000 + 42 * 60_000, // 3h 42m
      elsewhereMs: 1 * 3600_000 + 21 * 60_000, // 1h 21m
      longest: {
        durationMs: 47 * 60_000,
        projectLabel: 'Oracle',
        startTime: new Date(2026, 4, 25, 17, 38, 0).getTime(),
      },
    };
    const headline = generateTruthHeadline(shape);
    expect(headline).toContain('3 hours 42 minutes of focused work');
    expect(headline).toContain('1 hour 21 minutes elsewhere');
    expect(headline).toContain('47 min on Oracle');
    expect(headline).toContain('5:38pm');
  });

  it('handles zero focused work without crashing', () => {
    const shape: DayShape = {
      focusedMs: 0,
      elsewhereMs: 2 * 3600_000,
      longest: null,
    };
    const headline = generateTruthHeadline(shape);
    expect(headline).toContain('0 hours 0 minutes of focused work');
    expect(headline).toContain('2 hours 0 minutes elsewhere');
    expect(headline).not.toContain('Longest stretch');
  });

  it('singularizes hour when 1h exactly', () => {
    const shape: DayShape = {
      focusedMs: 3600_000,
      elsewhereMs: 5 * 60_000,
      longest: {
        durationMs: 60 * 60_000,
        projectLabel: 'Oracle',
        startTime: new Date(2026, 4, 25, 9, 0, 0).getTime(),
      },
    };
    const headline = generateTruthHeadline(shape);
    expect(headline).toContain('1 hour 0 minutes');
    expect(headline).toContain('0 hours 5 minutes');
  });

  it('contains no banned vocabulary', () => {
    const shape: DayShape = {
      focusedMs: 12 * 60_000,
      elsewhereMs: 3 * 3600_000,
      longest: {
        durationMs: 12 * 60_000,
        projectLabel: 'Oracle',
        startTime: Date.now(),
      },
    };
    const headline = generateTruthHeadline(shape);
    const banned = ['should', 'failed', 'missed', 'wasted', 'drifted', 'off-track'];
    for (const word of banned) {
      expect(headline.toLowerCase()).not.toContain(word);
    }
  });

  it('formats single-digit minutes correctly', () => {
    const shape: DayShape = {
      focusedMs: 6 * 60_000,
      elsewhereMs: 0,
      longest: {
        durationMs: 6 * 60_000,
        projectLabel: 'Test',
        startTime: new Date(2026, 4, 25, 7, 5, 0).getTime(),
      },
    };
    const headline = generateTruthHeadline(shape);
    expect(headline).toContain('0 hours 6 minutes');
  });
});
