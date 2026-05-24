import React, { useEffect, useState } from 'react';
import { useRemirror } from '../hooks/useRemirror';
import type { Project } from '@shared/types';
import { Button } from './Button';
import { Input } from './Input';

export function ProjectEditor() {
  const api = useRemirror();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.listProjects().then(loadedProjects => {
      if (loadedProjects.length === 0) {
        // Seed two placeholder rows so empty state isn't blank.
        // These are local-only until the user edits them and an onBlur save fires.
        setProjects([
          { id: '', label: 'Project A', category: null, keywords: ['projecta', 'client-work'], goal_id: null, display_order: 0 },
          { id: '', label: 'Project B', category: null, keywords: ['internal', 'dev'], goal_id: null, display_order: 1 },
        ]);
      } else {
        setProjects(loadedProjects);
      }
      setLoaded(true);
    });
  }, [api]);

  function update(idx: number, patch: Partial<Project>) {
    setProjects(prev => prev.map((p, i) => i === idx ? { ...p, ...patch } : p));
  }

  async function saveOnBlur(p: Project, idx: number) {
    // Skip empty rows (placeholder rows the user hasn't engaged with).
    if (!p.label.trim()) return;
    const saved = await api.upsertProject(p);
    setProjects(prev => prev.map((x, i) => i === idx ? saved : x));
  }

  async function remove(p: Project, idx: number) {
    if (p.id) await api.deleteProject(p.id);
    setProjects(prev => prev.filter((_, i) => i !== idx));
  }

  function addEmpty() {
    setProjects(prev => [
      ...prev,
      {
        id: '',
        label: '',
        category: null,
        keywords: [],
        goal_id: null,
        display_order: prev.length,
      },
    ]);
  }

  if (!loaded) return <div className="text-muted">Loading projects…</div>;

  return (
    <div className="space-y-3">
      {projects.map((p, i) => (
        <div key={p.id || `new-${i}`} className="bg-surface p-4 rounded-lg space-y-2">
          <Input
            placeholder="Project name"
            value={p.label}
            onChange={e => update(i, { label: e.target.value })}
            onBlur={() => saveOnBlur(p, i)}
          />
          <Input
            placeholder="Keywords, comma-separated (match against window titles)"
            value={p.keywords.join(', ')}
            onChange={e => update(i, {
              keywords: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
            })}
            onBlur={() => saveOnBlur(p, i)}
          />
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => remove(p, i)}>Remove</Button>
          </div>
        </div>
      ))}
      <Button variant="ghost" onClick={addEmpty}>+ Add project</Button>
      <p className="text-muted text-sm">
        Edits auto-save when you click out of a field. Keywords match (case-insensitive substring)
        against both window titles and app names. First match wins.
      </p>
    </div>
  );
}
