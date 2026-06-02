import { describe, it, expect } from 'vitest';
import { cleanWindowTitle } from '@shared/clean-title';

describe('cleanWindowTitle', () => {
  it('strips trailing " - <AppName>" when app matches', () => {
    expect(cleanWindowTitle('remirror — Visual Studio Code', 'Visual Studio Code')).toBe('remirror');
    expect(cleanWindowTitle('My Doc - Notepad', 'Notepad')).toBe('My Doc');
  });

  it('strips well-known browser suffixes even when app is chrome.exe', () => {
    expect(cleanWindowTitle('Twitter / X - Google Chrome', 'chrome.exe')).toBe('Twitter / X');
    expect(cleanWindowTitle('Hacker News - Mozilla Firefox', 'firefox.exe')).toBe('Hacker News');
  });

  it('takes first chunk before " — " / " - " for multi-part titles', () => {
    expect(cleanWindowTitle('(3) Inbox - jesse@gmail.com - Gmail - Google Chrome', 'chrome.exe')).toBe('(3) Inbox');
  });

  it('falls back to app name (sans .exe) when title is empty', () => {
    expect(cleanWindowTitle('', 'Code.exe')).toBe('Code');
    expect(cleanWindowTitle(null, 'chrome.exe')).toBe('chrome');
    expect(cleanWindowTitle(undefined, 'Notepad.exe')).toBe('Notepad');
  });

  it('returns "unknown" when both title and app are empty', () => {
    expect(cleanWindowTitle('', '')).toBe('unknown');
    expect(cleanWindowTitle(null, null)).toBe('unknown');
  });

  it('truncates long titles to 40 chars with ellipsis', () => {
    const long = 'A very long document title that goes well past the forty character cap';
    const result = cleanWindowTitle(long, null);
    expect(result.length).toBeLessThanOrEqual(40);
    expect(result.endsWith('…')).toBe(true);
  });

  it('preserves short titles verbatim', () => {
    expect(cleanWindowTitle('Slack', 'slack.exe')).toBe('Slack');
  });

  it('handles case-insensitive app match when stripping suffix', () => {
    expect(cleanWindowTitle('My Document - VISUAL STUDIO CODE', 'Visual Studio Code')).toBe('My Document');
  });

  it('uses full working string when first chunk is too short (< 3 chars)', () => {
    // "a - very important - meeting" → first chunk "a" is too short → use full string
    expect(cleanWindowTitle('a - very important - meeting', null)).toBe('a - very important - meeting');
  });

  it('handles em-dash and en-dash separators', () => {
    expect(cleanWindowTitle('Page Title — Some App', 'Some App')).toBe('Page Title');
    expect(cleanWindowTitle('Page Title – Some App', 'Some App')).toBe('Page Title');
  });
});
