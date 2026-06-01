import { safeStorage } from 'electron';
import { store } from '../store';
import log from '../log';

const ENC_PREFIX = 'enc:';
const PLN_PREFIX = 'pln:';

/**
 * Reads the stored Anthropic API key, decrypted via safeStorage if available.
 * Returns null when no key is stored or when decryption fails.
 *
 * Format: stored strings are prefixed with 'enc:' (base64-encrypted) or
 * 'pln:' (plaintext fallback). Legacy unprefixed values are treated as
 * base64-encrypted for backwards compatibility.
 */
export function readAnthropicKey(): string | null {
  const stored = store.get('anthropic').apiKey;
  if (!stored) return null;
  if (stored.startsWith(ENC_PREFIX)) {
    try {
      return safeStorage.decryptString(Buffer.from(stored.slice(ENC_PREFIX.length), 'base64'));
    } catch (err) {
      log.warn('Anthropic key decryption failed — keyring state may have changed. Key is unusable; user must re-enter.', err);
      return null;
    }
  }
  if (stored.startsWith(PLN_PREFIX)) {
    return stored.slice(PLN_PREFIX.length);
  }
  // Legacy unprefixed format — treat as base64-encrypted (matches old behavior)
  try {
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(stored, 'base64')) : stored;
  } catch {
    log.warn('Legacy Anthropic key format failed to decrypt — user must re-enter');
    return null;
  }
}

export function writeAnthropicKey(plaintext: string): void {
  const trimmed = plaintext.trim();
  if (!trimmed) { clearAnthropicKey(); return; }
  const current = store.get('anthropic');
  let toStore: string;
  if (safeStorage.isEncryptionAvailable()) {
    toStore = ENC_PREFIX + safeStorage.encryptString(trimmed).toString('base64');
  } else {
    toStore = PLN_PREFIX + trimmed;
    log.warn('safeStorage encryption unavailable — Anthropic key stored in plaintext');
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
