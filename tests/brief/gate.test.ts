import { describe, it, expect } from 'vitest';
import { gateBrief, MAX_AUTO_REGENS_FOR_VIOLATIONS } from '@main/brief/gate';

describe('gateBrief', () => {
  it('MAX_AUTO_REGENS_FOR_VIOLATIONS is 3', () => {
    expect(MAX_AUTO_REGENS_FOR_VIOLATIONS).toBe(3);
  });

  it('returns ok when output has no banned vocabulary', () => {
    const clean = `## Truth headline\nFoo bar\n\n## Today's story\nStory.\n\n## What held\nh\n\n## What fragmented\nf\n\n## Tomorrow's first 90\nt`;
    const result = gateBrief(clean);
    expect(result.ok).toBe(true);
    expect(result.violatedWords).toEqual([]);
  });

  it('returns rejected when output contains a banned word', () => {
    const bad = `## Truth headline\nYou missed the goal.\n\n## Today's story\nStory.`;
    const result = gateBrief(bad);
    expect(result.ok).toBe(false);
    expect(result.violatedWords).toContain('missed');
  });

  it('deduplicates violated words', () => {
    const bad = `## Truth headline\nYou missed and missed again.`;
    const result = gateBrief(bad);
    expect(result.ok).toBe(false);
    expect(result.violatedWords).toEqual(['missed']);
  });

  it('catches multiple distinct banned words', () => {
    const bad = `## Truth headline\nYou failed and drifted today.`;
    const result = gateBrief(bad);
    expect(result.ok).toBe(false);
    expect(result.violatedWords.sort()).toEqual(['drifted', 'failed']);
  });

  it('uses word boundaries — "should" matches "should" but not "shoulder"', () => {
    expect(gateBrief('You should stop.').ok).toBe(false);
    expect(gateBrief('A shoulder injury.').ok).toBe(true);
  });

  it('case-insensitive', () => {
    expect(gateBrief('You MISSED it.').ok).toBe(false);
    expect(gateBrief('YOU FAILED').ok).toBe(false);
  });
});
