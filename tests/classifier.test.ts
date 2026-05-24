import { describe, it, expect } from 'vitest';
import { classify } from '@main/capture/classifier';
import type { Project } from '@shared/types';

const projects: Project[] = [
  { id: 'p1', label: 'Project A', category: null, keywords: ['projecta', 'client-work'], goal_id: null, display_order: 0 },
  { id: 'p2', label: 'Project B', category: null, keywords: ['internal', 'dev'], goal_id: null, display_order: 1 },
];

describe('classify', () => {
  it('matches a keyword in the window title (case-insensitive)', () => {
    const result = classify({ appName: 'Code.exe', windowTitle: 'client-work · main · VS Code' }, projects);
    expect(result).toEqual({ label: 'Project A', confidence: 1.0 });
  });

  it('matches a keyword in the app name', () => {
    const result = classify({ appName: 'Internal Tool.exe', windowTitle: 'Untitled' }, projects);
    expect(result).toEqual({ label: 'Project B', confidence: 1.0 });
  });

  it('returns unclassified when nothing matches', () => {
    const result = classify({ appName: 'chrome.exe', windowTitle: 'Wikipedia' }, projects);
    expect(result).toEqual({ label: 'unclassified', confidence: 0 });
  });

  it('first-project-in-order wins on ambiguous match', () => {
    const ambiguous: Project[] = [
      { id: 'p1', label: 'First', category: null, keywords: ['foo'], goal_id: null, display_order: 0 },
      { id: 'p2', label: 'Second', category: null, keywords: ['foo'], goal_id: null, display_order: 1 },
    ];
    const result = classify({ appName: 'x', windowTitle: 'foo' }, ambiguous);
    expect(result.label).toBe('First');
  });

  it('handles empty keywords gracefully', () => {
    const result = classify({ appName: 'x', windowTitle: 'y' }, [
      { id: 'p1', label: 'Empty', category: null, keywords: [], goal_id: null, display_order: 0 },
    ]);
    expect(result).toEqual({ label: 'unclassified', confidence: 0 });
  });

  it('null app/title does not crash', () => {
    const result = classify({ appName: null, windowTitle: null }, projects);
    expect(result).toEqual({ label: 'unclassified', confidence: 0 });
  });
});
