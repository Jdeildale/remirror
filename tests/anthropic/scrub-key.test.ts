import { describe, it, expect } from 'vitest';
import { anthropicErrorMessage } from '@main/anthropic/client';

describe('anthropicErrorMessage key scrubbing', () => {
  it('scrubs a raw sk-ant key from an error message', () => {
    const err = { message: 'Request failed with key sk-ant-api03-abc123XYZ_longkeyvalue' };
    const result = anthropicErrorMessage(err);
    expect(result).not.toContain('sk-ant-api03-abc123XYZ_longkeyvalue');
    expect(result).toContain('sk-ant-***');
  });

  it('scrubs a key embedded mid-sentence', () => {
    const err = { message: 'Authentication failed: apiKey=sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx is invalid' };
    const result = anthropicErrorMessage(err);
    expect(result).not.toMatch(/sk-ant-api03-x+/);
    expect(result).toContain('sk-ant-***');
  });

  it('returns status-mapped messages unchanged for numeric error codes', () => {
    expect(anthropicErrorMessage({ status: 401 })).toBe('Invalid API key. Update it in Settings.');
    expect(anthropicErrorMessage({ status: 429 })).toBe('Rate limited by Anthropic. Try again in a moment.');
    expect(anthropicErrorMessage({ status: 403 })).toBe('API key lacks permission for the selected model.');
  });

  it('handles string errors without crashing', () => {
    const result = anthropicErrorMessage('some plain error');
    expect(typeof result).toBe('string');
  });

  it('handles null/undefined without crashing', () => {
    expect(() => anthropicErrorMessage(null)).not.toThrow();
    expect(() => anthropicErrorMessage(undefined)).not.toThrow();
  });
});
