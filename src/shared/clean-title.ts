/**
 * Cleans a raw window title for display in the "What you did" timeline and
 * in the daily brief payload sent to Claude.
 *
 * Goals (in priority order):
 * 1. Strip the trailing " - <App Name>" / " — <App Name>" suffix when the
 *    title ends in the app's own name (Chrome, Gmail, VS Code, etc.).
 * 2. Strip well-known browser/app suffixes even when they don't appear in
 *    app_name (Chrome processes report as `chrome.exe` but titles end in
 *    " - Google Chrome").
 * 3. Take the first meaningful chunk before " — " / " - " separators
 *    (usually the page/document name; e.g. "Inbox — user@gmail.com - Gmail"
 *    → "Inbox").
 * 4. Truncate to 40 chars with a trailing ellipsis.
 * 5. Fall back to the app name (with `.exe` stripped) when the title is empty.
 *
 * Pure function — no side effects, no I/O.
 */

const BROWSER_SUFFIXES = [
  'Google Chrome',
  'Mozilla Firefox',
  'Microsoft Edge',
  'Safari',
  'Opera',
  'Brave',
  'Vivaldi',
  'Arc',
  'Chromium',
];

const SEPARATOR = /\s+[-—–]\s+/;
const MAX_LENGTH = 40;

function escapeRegex(s: string): string {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function stripExe(app: string): string {
  return app.replace(/\.exe$/i, '').trim();
}

export function cleanWindowTitle(title: string | null | undefined, appName: string | null | undefined): string {
  const rawApp = (appName ?? '').trim();
  const cleanApp = rawApp ? stripExe(rawApp) : '';
  const raw = (title ?? '').trim();

  if (!raw) {
    return cleanApp || 'unknown';
  }

  let working = raw;

  // 1. Strip trailing " - <AppName>" when title repeats the app name
  if (cleanApp) {
    const stripAppPattern = new RegExp(`\\s+[-—–]\\s+${escapeRegex(cleanApp)}\\s*$`, 'i');
    working = working.replace(stripAppPattern, '');
  }

  // 2. Strip well-known browser/app suffixes
  for (const suffix of BROWSER_SUFFIXES) {
    const pattern = new RegExp(`\\s+[-—–]\\s+${escapeRegex(suffix)}\\s*$`, 'i');
    working = working.replace(pattern, '');
  }

  // 3. Take first chunk before a " — " / " - " separator if substantial
  const firstChunk = working.split(SEPARATOR)[0].trim();
  const useChunk = firstChunk.length >= 3 ? firstChunk : working;

  // 4. Truncate
  if (useChunk.length > MAX_LENGTH) {
    return useChunk.slice(0, MAX_LENGTH - 1).trimEnd() + '…';
  }

  return useChunk;
}
