// Single source of truth for the banned vocabulary from
// docs/superpowers/specs/CRYSTALLIZED-CONTEXT-adhd-design-frame.md.
// Used by Phase 2a's renderer linter test AND by Phase 4's post-generation gate.

export const BANNED_VOCABULARY: ReadonlyArray<string> = [
  'should',
  'failed',
  'missed',
  'wasted',
  'drifted',
  'off-track',
  'skipped',
  'behind',
  'slipping',
  'broken streak',
  'lost focus',
  'gave up',
  'fell off',
  'neglected',
  'ignored',
];

export interface BannedVocabHit {
  word: string;
  matchedText: string;
  index: number;
}

/**
 * Scans the input text for any banned word (case-insensitive, word boundaries).
 * Returns all hits. Empty array when clean.
 */
export function scanForBannedVocabulary(text: string): BannedVocabHit[] {
  const hits: BannedVocabHit[] = [];
  const lower = text.toLowerCase();
  for (const w of BANNED_VOCABULARY) {
    const escaped = w.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(lower)) !== null) {
      hits.push({ word: w, matchedText: text.slice(m.index, m.index + m[0].length), index: m.index });
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}
