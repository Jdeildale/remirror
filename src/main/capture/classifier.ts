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

  // Stable ordering by display_order, then by id, so first-match-wins is deterministic.
  const ordered = [...projects].sort((a, b) => {
    if (a.display_order !== b.display_order) return a.display_order - b.display_order;
    return a.id.localeCompare(b.id);
  });

  for (const project of ordered) {
    for (const kw of project.keywords) {
      if (!kw) continue;
      if (haystack.includes(kw.toLowerCase())) {
        return { label: project.label, confidence: 1.0 };
      }
    }
  }
  return { label: 'unclassified', confidence: 0 };
}
