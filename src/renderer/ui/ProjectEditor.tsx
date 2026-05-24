import React, { useEffect, useState } from 'react';
import { useRemirror } from '../hooks/useRemirror';
import type { Project } from '@shared/types';
import { Button } from './Button';
import { Input } from './Input';

interface Props {
  onChange?: (projects: Project[]) => void;
}

export function ProjectEditor({ onChange }: Props) {
  const api = useRemirror();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.listProjects().then(loaded => {
      if (loaded.length === 0) {
        // Seed two placeholder rows so empty state isn't blank.
        setProjects([
          { id: '', label: 'Project A', category: null, keywords: ['projecta', 'client-work'], goal_id: null, display_order: 0 },
          { id: '', label: 'Project B', category: null, keywords: ['internal', 'dev'], goal_id: null, display_order: 1 },
        ]);
      } else {
        setProjects(loaded);
      }
      setLoaded(true);
    });
  }, [api]);

  useEffect(() => { onChange?.(projects); }, [projects, onChange]);

  function update(idx: number, patch: Partial<Project>) {
    setProjects(prev => prev.map((p, i) => i === idx ? { ...p, ...patch } : p));
  }

  async function save(p: Project, idx: number) {
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
        <div key={i} className="bg-surface p-4 rounded-lg space-y-2">
          <Input
            placeholder="Project name"
            value={p.label}
            onChange={e => update(i, { label: e.target.value })}
          />
          <Input
            placeholder="Keywords, comma-separated (match against window titles)"
            value={p.keywords.join(', ')}
            onChange={e => update(i, {
              keywords: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
            })}
          />
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => save(p, i)} disabled={!p.label}>Save</Button>
            <Button variant="ghost" onClick={() => remove(p, i)}>Remove</Button>
          </div>
        </div>
      ))}
      <Button variant="ghost" onClick={addEmpty}>+ Add project</Button>
      <p className="text-muted text-sm">
        Keywords are matched (case-insensitive substring) against both window titles and app names.
        First match wins.
      </p>
    </div>
  );
}
