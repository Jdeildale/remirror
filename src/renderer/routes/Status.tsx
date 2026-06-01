import React, { useEffect, useState } from 'react';
import { useRemirror } from '../hooks/useRemirror';
import type { EngineStatus } from '@shared/types';
import type { WorkHoursConfigDTO } from '@shared/ipc-contract';
import { Button } from '../ui/Button';
import { ProjectEditor } from '../ui/ProjectEditor';
import { ExclusionEditor } from '../ui/ExclusionEditor';
import { WorkHoursEditor } from '../ui/WorkHoursEditor';
import { Logo } from '../ui/Logo';
import { StoryColumn } from '../ui/StoryColumn';
import { Timeline } from '../ui/Timeline';
import { CalendarColumn } from '../ui/CalendarColumn';
import { Brief } from './Brief';
import clsx from 'clsx';

type Tab = 'today' | 'brief' | 'projects' | 'exclusions' | 'schedule';

interface Props {
  tab: Tab;
  onTabChange: (t: Tab) => void;
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
  const [workHours, setWorkHours] = useState<WorkHoursConfigDTO | null>(null);

  async function refreshStatus() {
    const [st, wh] = await Promise.all([api.getEngineStatus(), api.getWorkHours()]);
    setStatus(st);
    setWorkHours(wh);
  }

  useEffect(() => {
    refreshStatus();
    const off = api.onEngineStatusChanged(setStatus);
    const interval = setInterval(refreshStatus, 10_000);
    return () => { off(); clearInterval(interval); };
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
    <div className="min-h-full">
      <div className="flex items-center justify-between p-4 border-b border-[#312d28] px-6">
        <div className="flex items-center gap-3">
          <Logo size={22} />
          <h1 className="text-[15px] font-semibold text-text">{STATUS_LABEL[status]}</h1>
        </div>
        <div className="flex gap-4 text-xs">
          {tabBtn('today', 'Today')}
          {tabBtn('brief', 'Brief')}
          {tabBtn('projects', 'Projects')}
          {tabBtn('exclusions', 'Exclusions')}
          {tabBtn('schedule', 'Schedule')}
        </div>
        <Button
          variant="ghost"
          onClick={() => status === 'paused' ? api.resumeCapture() : api.pauseCapture()}
        >
          {status === 'paused' ? 'Resume' : 'Pause'}
        </Button>
      </div>

      {tab === 'today' && (
        <div className="grid grid-cols-3 min-h-[640px]">
          <StoryColumn />
          <Timeline workHoursStart={workHours?.start} workHoursEnd={workHours?.end} />
          <CalendarColumn workHoursStart={workHours?.start} workHoursEnd={workHours?.end} />
        </div>
      )}

      {tab === 'brief' && (
        <Brief onNavigateToSettings={() => onTabChange('schedule')} />
      )}

      {tab === 'projects' && <div className="p-6 max-w-4xl"><ProjectEditor /></div>}
      {tab === 'exclusions' && <div className="p-6 max-w-4xl"><ExclusionEditor /></div>}
      {tab === 'schedule' && <div className="p-6 max-w-4xl"><WorkHoursEditor /></div>}
    </div>
  );
}
