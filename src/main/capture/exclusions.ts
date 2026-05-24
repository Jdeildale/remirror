import type { Exclusion } from '@shared/types';

export interface ExclusionInput {
  appName: string | null;
  windowTitle: string | null;
}

export function isExcluded(input: ExclusionInput, exclusions: Exclusion[]): boolean {
  const app = (input.appName ?? '').toLowerCase().trim();
  const title = (input.windowTitle ?? '').toLowerCase();

  for (const ex of exclusions) {
    if (ex.app_name) {
      if (app === ex.app_name.toLowerCase().trim()) return true;
    }
    if (ex.window_title_contains) {
      if (title.includes(ex.window_title_contains.toLowerCase())) return true;
    }
  }
  return false;
}
