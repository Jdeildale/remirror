import { describe, it, expect } from 'vitest';
import { isExcluded } from '@main/capture/exclusions';
import type { Exclusion } from '@shared/types';

const ex: Exclusion[] = [
  { id: '1', app_name: '1Password', window_title_contains: null, reason: null },
  { id: '2', app_name: null, window_title_contains: 'bank', reason: null },
  { id: '3', app_name: null, window_title_contains: 'login', reason: null },
];

describe('isExcluded', () => {
  it('matches app name exactly, case-insensitive', () => {
    expect(isExcluded({ appName: '1password', windowTitle: '' }, ex)).toBe(true);
    expect(isExcluded({ appName: '1Password', windowTitle: '' }, ex)).toBe(true);
  });

  it('does not match partial app name', () => {
    expect(isExcluded({ appName: 'NotPassword', windowTitle: '' }, ex)).toBe(false);
  });

  it('matches title substring, case-insensitive', () => {
    expect(isExcluded({ appName: 'chrome', windowTitle: 'Chase Bank Login' }, ex)).toBe(true);
  });

  it('handles null app and title', () => {
    expect(isExcluded({ appName: null, windowTitle: null }, ex)).toBe(false);
  });

  it('empty exclusion list returns false', () => {
    expect(isExcluded({ appName: '1Password', windowTitle: 'anything' }, [])).toBe(false);
  });
});
