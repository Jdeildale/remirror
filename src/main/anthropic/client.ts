import Anthropic from '@anthropic-ai/sdk';
import { readAnthropicKey } from './key';
import { store } from '../store';
import log from '../log';

/**
 * Returns a configured Anthropic SDK client. Throws if no key is stored.
 */
export function getAnthropicClient(): Anthropic {
  const key = readAnthropicKey();
  if (!key) throw new Error('ANTHROPIC_API_KEY_MISSING');
  return new Anthropic({ apiKey: key });
}

export function getConfiguredModel(): string {
  return store.get('anthropic').model;
}

/**
 * Validates the stored key + model with a minimal call. Costs ~1 input token.
 * Returns { ok: true } on success or { ok: false, error } with a user-friendly
 * message on failure.
 */
export async function testConnection(): Promise<{ ok: true } | { ok: false; error: string }> {
  let client: Anthropic;
  try { client = getAnthropicClient(); } catch (e) {
    return { ok: false, error: 'No API key configured.' };
  }
  try {
    await client.messages.create({
      model: getConfiguredModel(),
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }],
    });
    return { ok: true };
  } catch (e) {
    const msg = anthropicErrorMessage(e);
    log.warn('Anthropic testConnection failed:', msg);
    return { ok: false, error: msg };
  }
}

export function anthropicErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { status?: number; message?: string; error?: { message?: string } };
    if (e.status === 401) return 'Invalid API key. Update it in Settings.';
    if (e.status === 429) return 'Rate limited by Anthropic. Try again in a moment.';
    if (e.status === 403) return 'API key lacks permission for the selected model.';
    if (e.status && e.status >= 500) return 'Anthropic service unavailable. Try again later.';
    if (e.error?.message) return e.error.message;
    if (e.message) return e.message;
  }
  return String(err);
}
