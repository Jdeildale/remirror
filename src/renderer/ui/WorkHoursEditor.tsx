import React, { useEffect, useState, useRef } from 'react';
import { useRemirror } from '../hooks/useRemirror';
import type { WorkHoursConfigDTO } from '@shared/ipc-contract';
import { Input } from './Input';
import { GoogleConnectButton } from './GoogleConnectButton';
import { GoalEditor } from './GoalEditor';
import { AnthropicApiCard } from './AnthropicApiCard';

export function WorkHoursEditor() {
  const api = useRemirror();
  const [cfg, setCfg] = useState<WorkHoursConfigDTO | null>(null);
  const [saved, setSaved] = useState(false);
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const c = await api.getWorkHours();
      if (mounted) setCfg(c);
    })();
    return () => {
      mounted = false;
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [api]);

  async function save(next: WorkHoursConfigDTO) {
    setCfg(next);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      await api.setWorkHours(next);
      setSaved(true);
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
      savedTimeoutRef.current = setTimeout(() => setSaved(false), 1500);
    }, 300);
  }

  if (!cfg) return <div className="text-muted">Loading…</div>;

  return (
    <div className="space-y-8">
      <div>
        <div>
          <h3 className="text-lg font-medium mb-1">When do you usually work?</h3>
          <p className="text-muted text-sm mb-4">
            Remirror keeps recording around the clock — this just tells the daily brief how to structure your day.
          </p>
        </div>

        <label className="flex items-center gap-3 cursor-pointer mb-4">
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

        {saved && <p className="text-accent text-xs mt-2">✓ Saved</p>}
      </div>

      <GoalEditor />
      <GoogleConnectButton />
      <AnthropicApiCard />
    </div>
  );
}
