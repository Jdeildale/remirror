import React, { useEffect, useState } from 'react';
import { useRemirror } from '../hooks/useRemirror';
import type { WorkHoursConfigDTO } from '@shared/ipc-contract';
import { Input } from './Input';

export function WorkHoursEditor() {
  const api = useRemirror();
  const [cfg, setCfg] = useState<WorkHoursConfigDTO | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getWorkHours().then(setCfg);
  }, [api]);

  async function save(next: WorkHoursConfigDTO) {
    setCfg(next);
    await api.setWorkHours(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  if (!cfg) return <div className="text-muted">Loading…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-1">When do you usually work?</h3>
        <p className="text-muted text-sm">
          Remirror keeps recording around the clock — this just tells the daily brief how to
          structure your day. The brief will say something like:{' '}
          <span className="text-text">"before 9am you spent 40min on X, during work you did Y and Z,
          after 5pm you returned to X for 20min."</span>{' '}
          If you don't have a typical schedule, leave this off and the brief won't bucket.
        </p>
      </div>

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={cfg.enabled}
          onChange={e => save({ ...cfg, enabled: e.target.checked })}
          className="w-4 h-4 accent-accent"
        />
        <span className="text-sm">Use a typical work schedule</span>
      </label>

      <div className={cfg.enabled ? '' : 'opacity-50 pointer-events-none'}>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="space-y-1">
            <label className="text-xs text-muted">Start time</label>
            <Input
              type="time"
              value={cfg.start}
              onChange={e => save({ ...cfg, start: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted">End time</label>
            <Input
              type="time"
              value={cfg.end}
              onChange={e => save({ ...cfg, end: e.target.value })}
            />
          </div>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={cfg.weekendsActive}
            onChange={e => save({ ...cfg, weekendsActive: e.target.checked })}
            className="w-4 h-4 accent-accent"
          />
          <span className="text-sm">Weekends count as work days</span>
        </label>
      </div>

      <p className="text-muted text-xs">
        Times are in your computer's local timezone. The brief uses this to label sessions
        as before-work / during-work / after-work — it doesn't pause recording outside this window.
      </p>

      {saved && <p className="text-accent text-xs">✓ Saved</p>}
    </div>
  );
}
