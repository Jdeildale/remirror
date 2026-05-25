import React, { useEffect, useState } from 'react';
import { useRemirror } from '../hooks/useRemirror';
import type { Session, Project, EngineStatus } from '@shared/types';
import type { TodayStats } from '@shared/ipc-contract';
import { Button } from '../ui/Button';
import { SessionRow } from '../ui/SessionRow';
import { ProjectEditor } from '../ui/ProjectEditor';
import { ExclusionEditor } from '../ui/ExclusionEditor';
import { WorkHoursEditor } from '../ui/WorkHoursEditor';
import { Logo } from '../ui/Logo';
import clsx from 'clsx';

type Tab = 'today' | 'projects' | 'exclusions' | 'schedule';

interface Props {
  tab: Tab;
  onTabChange: (t: Tab) => void;
}

function fmtMs(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

const STATUS_LABEL: Record<EngineStatus, string> = {
  active: 'Capture: Active',
  paused: 'Capture: Paused',
  excluded: 'Capture: Excluded app active',
  stopped: 'Capture: Stopped',
};

export function Status({ tab, onTabChange }: Props) {
  const api = useRemirror();
  const [status, setStatus] = useState<EngineStatus>('stopped');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<TodayStats | null>(null);

  async function refresh() {
    const [s, p, t, st] = await Promise.all([
      api.recentSessions(20),
      api.listProjects(),
      api.todayStats(),
      api.getEngineStatus(),
    ]);
    setSessions(s);
    setProjects(p);
    setStats(t);
    setStatus(st);
  }

  useEffect(() => {
    refresh();
    const off1 = api.onSessionsChanged(refresh);
    const off2 = api.onEngineStatusChanged(setStatus);
    const interval = setInterval(refresh, 5000);
    return () => { off1(); off2(); clearInterval(interval); };
  }, [api]);

  const tabBtn = (id: Tab, label: string) => (
    <button
      key={id}
      onClick={() => onTabChange(id)}
      className={clsx(
        'px-4 py-2 text-sm font-medium border-b-2 -mb-px',
        tab === id ? 'border-accent text-text' : 'border-transparent text-muted hover:text-text',
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-full p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Logo size={28} color="#5fb6c4" />
          <h1 className="text-2xl font-semibold">{STATUS_LABEL[status]}</h1>
        </div>
        <Button
          variant="ghost"
          onClick={() => status === 'paused' ? api.resumeCapture() : api.pauseCapture()}
        >
          {status === 'paused' ? 'Resume' : 'Pause'}
        </Button>
      </div>

      <div className="border-b border-surface mb-6 flex gap-1">
        {tabBtn('today', 'Today')}
        {tabBtn('projects', 'Projects')}
        {tabBtn('exclusions', 'Exclusions')}
        {tabBtn('schedule', 'Schedule')}
      </div>

      {tab === 'today' && (
        <>
          {stats && (
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-surface rounded-lg p-4">
                <div className="text-muted text-sm">Sessions today</div>
                <div className="text-2xl font-semibold">{stats.totalSessions}</div>
              </div>
              <div className="bg-surface rounded-lg p-4">
                <div className="text-muted text-sm">Longest block</div>
                <div className="text-2xl font-semibold">{fmtMs(stats.longestBlockMs)}</div>
              </div>
              <div className="bg-surface rounded-lg p-4">
                <div className="text-muted text-sm">Top project</div>
                <div className="text-xl font-medium truncate">
                  {stats.topProjects[0]?.label ?? '—'}
                </div>
                <div className="text-muted text-xs">
                  {stats.topProjects[0] ? fmtMs(stats.topProjects[0].totalMs) : ''}
                </div>
              </div>
            </div>
          )}

          <h2 className="text-muted text-sm mb-2">Recent sessions</h2>
          <div className="space-y-2">
            {sessions.length === 0 && (
              <div className="text-muted text-sm p-4 bg-surface rounded-md">
                No sessions yet. Switch to another window — the engine records on focus change.
              </div>
            )}
            {sessions.map(s => (
              <SessionRow key={s.id} session={s} projects={projects} />
            ))}
          </div>
        </>
      )}

      {tab === 'projects' && <ProjectEditor />}
      {tab === 'exclusions' && <ExclusionEditor />}
      {tab === 'schedule' && <WorkHoursEditor />}
    </div>
  );
}
