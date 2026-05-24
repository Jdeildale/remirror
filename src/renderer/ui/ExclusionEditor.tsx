import React, { useEffect, useState } from 'react';
import { useRemirror } from '../hooks/useRemirror';
import type { Exclusion } from '@shared/types';
import { Button } from './Button';
import { Input } from './Input';

export function ExclusionEditor() {
  const api = useRemirror();
  const [exclusions, setExclusions] = useState<Exclusion[]>([]);
  const [draft, setDraft] = useState({ app_name: '', title: '', reason: '' });

  useEffect(() => { api.listExclusions().then(setExclusions); }, [api]);

  async function add() {
    if (!draft.app_name && !draft.title) return;
    const saved = await api.upsertExclusion({
      app_name: draft.app_name || null,
      window_title_contains: draft.title || null,
      reason: draft.reason || null,
    });
    setExclusions(prev => [...prev, saved]);
    setDraft({ app_name: '', title: '', reason: '' });
  }

  async function remove(id: string) {
    await api.deleteExclusion(id);
    setExclusions(prev => prev.filter(e => e.id !== id));
  }

  const seeded = exclusions.filter(e => e.id.startsWith('seed-'));
  const user = exclusions.filter(e => !e.id.startsWith('seed-'));

  return (
    <div className="space-y-4">
      <div className="bg-surface p-4 rounded-lg">
        <div className="text-sm text-muted mb-2">These defaults are always excluded:</div>
        <div className="text-sm space-y-1">
          {seeded.map(e => (
            <div key={e.id}>
              · {e.app_name ?? `title contains "${e.window_title_contains}"`}
              {e.reason && <span className="text-muted"> — {e.reason}</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-sm text-muted">Your custom exclusions:</div>
        {user.map(e => (
          <div key={e.id} className="bg-surface p-3 rounded-md flex items-center justify-between">
            <span className="text-sm">
              {e.app_name ?? `title contains "${e.window_title_contains}"`}
            </span>
            <Button variant="ghost" onClick={() => remove(e.id)}>Remove</Button>
          </div>
        ))}
      </div>

      <div className="bg-surface p-4 rounded-lg space-y-2">
        <Input placeholder="App name (exact, case-insensitive)" value={draft.app_name}
          onChange={e => setDraft(d => ({ ...d, app_name: e.target.value }))} />
        <Input placeholder="OR title-substring (case-insensitive)" value={draft.title}
          onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} />
        <Input placeholder="Reason (for your reference)" value={draft.reason}
          onChange={e => setDraft(d => ({ ...d, reason: e.target.value }))} />
        <Button onClick={add} disabled={!draft.app_name && !draft.title}>Add exclusion</Button>
      </div>
    </div>
  );
}
