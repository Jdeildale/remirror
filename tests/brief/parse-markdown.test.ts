import { describe, it, expect } from 'vitest';
import { parseBriefMarkdown } from '@main/brief/parse-markdown';

describe('parseBriefMarkdown', () => {
  it('parses five sections by ## headings', () => {
    const md = `## Truth headline
3 hours focused. 1 hour elsewhere. Longest: 47 min on Oracle at 5:38pm.

## Today's story
Some story content
across two paragraphs.

Another paragraph.

## What held
The Oracle attempt held.

## What fragmented
Inbox in 6-minute windows.

## Tomorrow's first 90
9:00-10:30 on the Oracle dashboard.
`;
    const result = parseBriefMarkdown(md);
    expect(result.ok).toBe(true);
    expect(result.sections!.headline).toContain('3 hours focused');
    expect(result.sections!.story).toContain('Some story content');
    expect(result.sections!.story).toContain('Another paragraph');
    expect(result.sections!.whatHeld).toContain('Oracle attempt held');
    expect(result.sections!.whatFragmented).toContain('6-minute windows');
    expect(result.sections!.tomorrowFirst90).toContain('9:00-10:30');
  });

  it('reports missing sections', () => {
    const md = `## Truth headline\nfoo\n\n## Today's story\nbar`;
    const result = parseBriefMarkdown(md);
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(['what_held', 'what_fragmented', 'tomorrow_first_90']);
  });

  it('reports empty section bodies', () => {
    const md = `## Truth headline\nfoo\n\n## Today's story\n\n## What held\nh\n\n## What fragmented\nf\n\n## Tomorrow's first 90\nt`;
    const result = parseBriefMarkdown(md);
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('story');
  });

  it('strips trailing structured-tail JSON block before splitting sections', () => {
    const md = `## Truth headline
foo

## Today's story
bar

## What held
h

## What fragmented
f

## Tomorrow's first 90
t

\`\`\`json
{"day_shape":"diffuse"}
\`\`\``;
    const result = parseBriefMarkdown(md);
    expect(result.ok).toBe(true);
    expect(result.sections!.tomorrowFirst90.trim()).toBe('t');
  });

  it('rejects ### (h3) headings — deeper hashes must not match ## patterns', () => {
    // All five headings written with ### should fail to parse (none recognised as h2).
    const md = `### Truth headline
foo

### Today's story
bar

### What held
h

### What fragmented
f

### Tomorrow's first 90
t`;
    const result = parseBriefMarkdown(md);
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(['headline', 'story', 'what_held', 'what_fragmented', 'tomorrow_first_90']);
  });

  it('is case-insensitive on heading text but preserves body case', () => {
    const md = `## TRUTH HEADLINE\nFoo Bar\n\n## TODAY'S STORY\nThe Story\n\n## WHAT HELD\nh\n\n## WHAT FRAGMENTED\nf\n\n## TOMORROW'S FIRST 90\nt`;
    const result = parseBriefMarkdown(md);
    expect(result.ok).toBe(true);
    expect(result.sections!.headline).toContain('Foo Bar');
    expect(result.sections!.story).toContain('The Story');
  });
});
