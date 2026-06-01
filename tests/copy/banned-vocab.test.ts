import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BANNED_VOCABULARY } from '@main/copy/banned-vocab';
import { gateBrief } from '@main/brief/gate';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rendererDir = path.resolve(__dirname, '../../src/renderer');

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      out.push(...walk(full, exts));
    } else if (exts.some(e => name.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

describe('banned vocabulary in user-facing copy', () => {
  it('no banned word appears in any renderer .tsx file', () => {
    const files = walk(rendererDir, ['.tsx']);
    const violations: { file: string; word: string; line: number; text: string }[] = [];
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      lines.forEach((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('import') || trimmed.startsWith('*')) return;
        const lower = line.toLowerCase();
        for (const w of BANNED_VOCABULARY) {
          const escaped = w.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
          const re = new RegExp(`\\b${escaped}\\b`, 'i');
          if (re.test(lower)) {
            violations.push({ file: path.relative(rendererDir, file), word: w, line: i + 1, text: line.trim() });
          }
        }
      });
    }
    if (violations.length > 0) {
      const summary = violations.map(v => `${v.file}:${v.line} → "${v.word}" in: ${v.text}`).join('\n');
      throw new Error(`Banned vocabulary found in renderer copy:\n${summary}`);
    }
    expect(violations.length).toBe(0);
  });
});

describe('banned-vocab gate on spec §4.3 bad-day exemplar', () => {
  it('the bad-day exemplar is gate-clean', () => {
    const exemplar = `## Truth headline
12 minutes focused. 4 hours 8 minutes elsewhere. Longest stretch: 12 min on Oracle at 2:14pm.

## Today's story
Today was diffuse. The Oracle dashboard got 12 minutes; the Jackie call and the 10am planning block did not start. Most of the day moved through Twitter, Slack, and the inbox in stretches of 4-9 minutes. There was no anchor block.

## What held
The 2:14pm Oracle attempt was the only stretch where attention landed on the commitment. It was short, and it was real.

## What fragmented
The morning never had a starting block. The first 90 minutes after wake went to inbox and Twitter in alternating 6-minute windows, and the day's shape followed from there.

## Tomorrow's first 90
9:00-10:30 on the Oracle dashboard, before the inbox opens. One target, one window, before anything else gets a vote.`;
    expect(gateBrief(exemplar).ok).toBe(true);
  });

  it('rejects a brief that uses banned vocab', () => {
    const bad = `## Truth headline\nYou missed the goal today.`;
    const result = gateBrief(bad);
    expect(result.ok).toBe(false);
    expect(result.violatedWords).toContain('missed');
  });
});
