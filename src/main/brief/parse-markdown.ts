export interface ParsedSections {
  headline: string;
  story: string;
  whatHeld: string;
  whatFragmented: string;
  tomorrowFirst90: string;
}

export type SectionKey = keyof ParsedSections;

const HEADING_PATTERNS: Array<{ key: SectionKey; pattern: RegExp }> = [
  { key: 'headline',         pattern: /^##(?!#)\s*truth\s+headline\s*$/im },
  { key: 'story',            pattern: /^##(?!#)\s*today'?s?\s+story\s*$/im },
  { key: 'whatHeld',         pattern: /^##(?!#)\s*what\s+held\s*$/im },
  { key: 'whatFragmented',   pattern: /^##(?!#)\s*what\s+fragmented\s*$/im },
  { key: 'tomorrowFirst90',  pattern: /^##(?!#)\s*tomorrow'?s?\s+first\s+90\s*$/im },
];

export interface ParseResult {
  ok: boolean;
  sections?: ParsedSections;
  missing?: Array<'headline' | 'story' | 'what_held' | 'what_fragmented' | 'tomorrow_first_90'>;
}

export function parseBriefMarkdown(markdown: string): ParseResult {
  // Strip trailing ```json …``` block (structured tail) so it doesn't pollute the last section's body.
  const stripped = markdown.replace(/```json[\s\S]*?```\s*$/m, '').trimEnd();

  // For each section, locate its heading position; the body is everything between
  // that heading line and the next heading line (or end-of-document).
  const lines = stripped.split('\n');
  const headingLineIndices: Array<{ key: SectionKey; lineIndex: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { key, pattern } of HEADING_PATTERNS) {
      if (pattern.test(line)) {
        headingLineIndices.push({ key, lineIndex: i });
      }
    }
  }

  const sections: Partial<Record<SectionKey, string>> = {};
  for (let i = 0; i < headingLineIndices.length; i++) {
    const cur = headingLineIndices[i];
    const next = headingLineIndices[i + 1];
    const body = lines.slice(cur.lineIndex + 1, next ? next.lineIndex : lines.length).join('\n').trim();
    if (body.length > 0) {
      sections[cur.key] = body;
    }
  }

  const missingKeys: Array<'headline' | 'story' | 'what_held' | 'what_fragmented' | 'tomorrow_first_90'> = [];
  const camelToSnake: Record<SectionKey, 'headline' | 'story' | 'what_held' | 'what_fragmented' | 'tomorrow_first_90'> = {
    headline: 'headline', story: 'story', whatHeld: 'what_held', whatFragmented: 'what_fragmented', tomorrowFirst90: 'tomorrow_first_90',
  };
  for (const key of ['headline', 'story', 'whatHeld', 'whatFragmented', 'tomorrowFirst90'] as const) {
    if (!sections[key]) missingKeys.push(camelToSnake[key]);
  }

  if (missingKeys.length > 0) {
    return { ok: false, missing: missingKeys };
  }

  return { ok: true, sections: sections as ParsedSections };
}
