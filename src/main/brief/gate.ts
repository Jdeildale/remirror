import { scanForBannedVocabulary } from '../copy/banned-vocab';

/**
 * Maximum number of automatic regenerations triggered by banned-vocab violations
 * or parse failures. Distinct from USER_REGEN_CAP (user-initiated regens).
 * After this many auto-attempts, the brief is stored with a warning footer.
 */
export const MAX_AUTO_REGENS_FOR_VIOLATIONS = 3;

export interface GateResult {
  ok: boolean;
  violatedWords: string[];
}

export function gateBrief(rawMarkdown: string): GateResult {
  const hits = scanForBannedVocabulary(rawMarkdown);
  if (hits.length === 0) return { ok: true, violatedWords: [] };
  const words = Array.from(new Set(hits.map(h => h.word))).sort();
  return { ok: false, violatedWords: words };
}
