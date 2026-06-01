import { safeStorage } from 'electron';
import { store } from '../store';
import log from '../log';

/**
 * Reads the stored Anthropic API key, decrypted via safeStorage if available.
 * Returns null when no key is stored.
 */
export function readAnthropicKey(): string | null {
  const stored = store.get('anthropic').apiKey;
  if (!stored) return null;
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(stored, 'base64'));
    }
    return stored;
  } catch (err) {
    log.warn('Failed to decrypt Anthropic API key; treating as missing', err);
    return null;
  }
}

export function writeAnthropicKey(plaintext: string): void {
  const trimmed = plaintext.trim();
  if (!trimmed) {
    clearAnthropicKey();
    return;
  }
  const current = store.get('anthropic');
  let toStore: string;
  if (safeStorage.isEncryptionAvailable()) {
    toStore = safeStorage.encryptString(trimmed).toString('base64');
  } else {
    toStore = trimmed;
  }
  store.set('anthropic', { ...current, apiKey: toStore });
  log.info('Anthropic API key stored');
}

export function clearAnthropicKey(): void {
  const current = store.get('anthropic');
  store.set('anthropic', { ...current, apiKey: undefined });
  log.info('Anthropic API key cleared');
}

export function hasAnthropicKey(): boolean {
  return readAnthropicKey() !== null;
}
