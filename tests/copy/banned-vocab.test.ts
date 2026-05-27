import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rendererDir = path.resolve(__dirname, '../../src/renderer');

const BANNED = [
  'should',
  'failed',
  'missed',
  'wasted',
  'drifted',
  'off-track',
  'skipped',
  'slipping',
  'broken streak',
  'lost focus',
  'gave up',
  'fell off',
  'neglected',
];

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
        for (const w of BANNED) {
          const re = new RegExp(`\\b${w.replace(/[-]/g, '[-]')}\\b`, 'i');
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
