import React, { useState } from 'react';
import type { Session, Project } from '@shared/types';
import { useRemirror } from '../hooks/useRemirror';

function fmtTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDuration(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 1) return '<1m';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h${m > 0 ? ` ${m}m` : ''}`;
}

interface Props {
  session: Session;
  projects: Project[];
}

export function SessionRow({ session, projects }: Props) {
  const api = useRemirror();
  const [open, setOpen] = useState(false);
  const duration = session.end_time
    ? Math.max(0, session.end_time - session.start_time - session.paused_ms)
    : 0;

  async function reclassify(label: string) {
    await api.reclassifySession(session.id, label);
    setOpen(false);
  }

  return (
    <div className="bg-surface rounded-md px-4 py-3 flex items-center justify-between">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted w-12 shrink-0">{fmtTime(session.start_time)}</span>
          <span className="text-text truncate font-medium">{session.window_title ?? '(no title)'}</span>
          <span className="text-muted text-xs shrink-0">{session.app_name}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted mt-1">
          <span>{fmtDuration(duration)}</span>
          <span>·</span>
          <span className={session.project_label === 'unclassified' ? 'text-amber' : 'text-accent'}>
            {session.project_label}
          </span>
        </div>
      </div>
      <div className="relative ml-3">
        <button
          className="text-xs text-muted hover:text-text px-2 py-1 rounded hover:bg-bg"
          onClick={() => setOpen(o => !o)}
        >
          Set project ▾
        </button>
        {open && (
          <div className="absolute right-0 mt-1 bg-bg ring-1 ring-surface rounded-md py-1 z-10 min-w-[160px]">
            {projects.map(p => (
              <button
                key={p.id}
                className="block w-full text-left px-3 py-1.5 text-sm hover:bg-surface"
                onClick={() => reclassify(p.label)}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
