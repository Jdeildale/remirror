import React, { useEffect, useState } from 'react';
import { useRemirror } from '../hooks/useRemirror';
import type { WeeklyGoalDTO, Project } from '@shared/types';
import { Button } from './Button';
import { Input } from './Input';

export function GoalEditor() {
  const api = useRemirror();
  const [goal, setGoal] = useState<WeeklyGoalDTO | null>(null);
  const [draftText, setDraftText] = useState('');
  const [draftProject, setDraftProject] = useState<string>('');
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [g, p] = await Promise.all([api.getGoal(), api.listProjects()]);
      if (!mounted) return;
      setGoal(g);
      setProjects(p);
      if (g) {
        setDraftText(g.text);
        setDraftProject(g.projectLabel ?? '');
      }
    })();
    return () => { mounted = false; };
  }, [api]);

  async function save() {
    if (!draftText.trim()) return;
    const next = await api.setGoal({ text: draftText.trim(), projectLabel: draftProject || undefined });
    setGoal(next);
  }

  async function clearGoal() {
    await api.setGoal(null);
    setGoal(null);
    setDraftText('');
    setDraftProject('');
  }

  return (
    <div className="bg-surface rounded-lg p-4 border border-[rgba(250,247,240,0.07)]">
      <h4 className="text-sm font-semibold text-text mb-2">This week's goal</h4>
      <p className="text-xs text-muted mb-3">
        Used in the daily forward-looking nudge. One sentence — what you said you'd do this week.
      </p>
      <Input
        placeholder="e.g., Ship the Oracle dashboard"
        value={draftText}
        onChange={e => setDraftText(e.target.value)}
        className="mb-2"
      />
      <select
        className="w-full bg-bg text-text rounded-md px-3 py-2 outline-none ring-1 ring-transparent focus:ring-accent mb-3"
        value={draftProject}
        onChange={e => setDraftProject(e.target.value)}
      >
        <option value="">(optional) link to a project for adherence tracking…</option>
        {projects.map(p => <option key={p.id} value={p.label}>{p.label}</option>)}
      </select>
      <div className="flex gap-2">
        <Button onClick={save} disabled={!draftText.trim()}>Save goal</Button>
        {goal && <Button variant="ghost" onClick={clearGoal}>Clear</Button>}
      </div>
      {goal && (
        <p className="text-xs text-quiet mt-3">Set {new Date(goal.setAt).toLocaleString()}.</p>
      )}
    </div>
  );
}
