// Anthropic model identifiers. Looked up from https://docs.anthropic.com/en/docs/about-claude/models
// at implementation time. Update when Anthropic publishes new generations.

export const MODEL_IDS = {
  sonnet: 'claude-sonnet-4-5',
  haiku: 'claude-haiku-4-5',
  opus: 'claude-opus-4-5',
} as const;

export type ModelKey = keyof typeof MODEL_IDS;
export type ModelId = typeof MODEL_IDS[ModelKey];

export const MODEL_LABELS: Record<ModelKey, string> = {
  sonnet: 'Sonnet 4.5',
  haiku: 'Haiku 4.5 — faster, cheaper',
  opus: 'Opus 4.5 — slowest, smartest',
};

// Static cost estimates per typical brief (5k in, 600 out). USD.
export const MODEL_COST_ESTIMATE_USD: Record<ModelKey, number> = {
  haiku: 0.005,
  sonnet: 0.025,
  opus: 0.10,
};

export function modelKeyFromId(id: string): ModelKey | null {
  const found = (Object.entries(MODEL_IDS) as Array<[ModelKey, string]>).find(([, v]) => v === id);
  return found ? found[0] : null;
}
