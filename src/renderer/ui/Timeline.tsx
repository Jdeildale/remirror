import React, { useEffect, useState, useMemo } from 'react';
import { useRemirror } from '../hooks/useRemirror';
import type { Session, DailyStatsDTO } from '@shared/types';
import { SessionBlock } from './SessionBlock';

interface Props {
  workHoursStart?: string;
  workHoursEnd?: string;
}

function parseHHMM(s: string | undefined, fallback: number): number {
  if (!s) return fallback;
  const [h, m] = s.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return fallback;
  return h * 60 + m;
}

export function Timeline({ workHoursStart, workHoursEnd }: Props) {
  const api = useRemirror();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [stats, setStats] = useState<DailyStatsDTO | null>(null);

  async function refresh(alive?: () => boolean) {
    const [s, st] = await Promise.all([
      api.recentSessions(500),
      api.todayStatsV2(),
    ]);
    if (alive && !alive()) return;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();
    setSessions(s.filter(x => x.start_time >= todayMs && x.end_time !== null));
    setStats(st);
  }

  useEffect(() => {
    let mounted = true;
    const alive = () => mounted;
    refresh(alive);
    const off = api.onSessionsChanged(() => refresh(alive));
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') refresh(alive);
    }, 5000);
    return () => { mounted = false; off(); clearInterval(interval); };
  }, [api]);

  const { timeRangeStart, timeRangeEnd, pixelsPerMs, totalHeight } = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();

    let startMs = todayMs + 7 * 3_600_000;
    let endMs = todayMs + 22 * 3_600_000;

    if (sessions.length > 0) {
      const earliest = Math.min(...sessions.map(s => s.start_time));
      const latest = Math.max(...sessions.map(s => s.end_time as number));
      startMs = Math.min(startMs, earliest);
      endMs = Math.max(endMs, latest);
    }

    const rangeMs = endMs - startMs;
    const totalHeight = 560;
    const pixelsPerMs = totalHeight / rangeMs;
    return { timeRangeStart: startMs, timeRangeEnd: endMs, pixelsPerMs, totalHeight };
  }, [sessions]);

  const tickHours = useMemo(() => {
    const start = new Date(timeRangeStart);
    start.setMinutes(0, 0, 0);
    const ticks = [];
    let cur = start.getTime();
    while (cur <= timeRangeEnd) {
      ticks.push(cur);
      cur += 3_600_000;
    }
    return ticks;
  }, [timeRangeStart, timeRangeEnd]);

  function topFor(ms: number): number {
    return (ms - timeRangeStart) * pixelsPerMs;
  }

  function fmtHourLabel(ts: number): string {
    const d = new Date(ts);
    const h = d.getHours();
    if (h === 0) return '12am';
    if (h === 12) return '12pm';
    return h < 12 ? `${h}` : `${h - 12}pm`;
  }

  const todayStart = new Date(timeRangeStart);
  todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();
  const whStart = todayMs + parseHHMM(workHoursStart, 9 * 60) * 60_000;
  const whEnd = todayMs + parseHHMM(workHoursEnd, 17 * 60) * 60_000;

  const longestId = stats?.longestBlock?.id ?? null;

  return (
    <div className="p-6 border-r border-[#312d28] relative bg-bg-deep" style={{ height: `${totalHeight + 60}px` }}>
      <div className="text-[10px] uppercase tracking-[1.5px] text-muted font-semibold mb-3.5">What you did</div>

      {tickHours.map(ts => (
        <div
          key={ts}
          className="absolute text-[10px] text-quiet pl-1.5"
          style={{ left: 0, top: `${60 + topFor(ts)}px` }}
        >
          {fmtHourLabel(ts)}
        </div>
      ))}

      <div
        className="absolute left-[30px] right-[18px] bg-[rgba(93,196,176,0.06)] border-l border-[rgba(93,196,176,0.22)] rounded-[2px]"
        style={{ top: `${60 + topFor(whStart)}px`, height: `${(whEnd - whStart) * pixelsPerMs}px` }}
      />

      {sessions.map(s => (
        <SessionBlock
          key={s.id}
          session={s}
          pixelsPerMs={pixelsPerMs}
          topOffsetPx={60 + topFor(s.start_time)}
          isLongestToday={s.id === longestId}
        />
      ))}
    </div>
  );
}
