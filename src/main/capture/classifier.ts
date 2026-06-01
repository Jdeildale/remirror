import type { Project } from '@shared/types';

export interface ClassifyInput {
  appName: string | null;
  windowTitle: string | null;
}

export interface ClassifyResult {
  label: string;
  confidence: number;
}

export function classify(
  input: ClassifyInput,
  projects: Project[],
): ClassifyResult {
  const haystack = `${input.appName ?? ''} ${input.windowTitle ?? ''}`.toLowerCase();
  if (!haystack.trim()) return { label: 'unclassified', confidence: 0 };

  // Projects are passed pre-sorted (ORDER BY display_order, id) from reloadProjects().
  // No per-call sort needed — first-match-wins is already deterministic.
  for (const project of projects) {
    for (const kw of project.keywords) {
      if (!kw) continue;
      if (haystack.includes(kw.toLowerCase())) {
        return { label: project.label, confidence: 1.0 };
      }
    }
  }
  return { label: 'unclassified', confidence: 0 };
}
