import React, { useEffect, useState, useMemo } from 'react';
import { useRemirror } from '../hooks/useRemirror';
import type { CalendarEventDTO, GoogleStatusDTO } from '@shared/types';
import { CalendarEventBlock } from './CalendarEventBlock';

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

interface LaidOutEvent {
  event: CalendarEventDTO;
  columnIndex: number;
  columnCount: number;
}

/**
 * Google-Calendar-style overlap layout. Sweep events sorted by start time and
 * place each in the leftmost column whose previous event has already ended.
 * Events that mutually overlap form a "cluster"; the cluster's max column
 * usage becomes the divisor for every event in that cluster, so the band's
 * width splits evenly. Non-overlapping events get columnCount=1 (full width).
 */
function layoutEvents(events: CalendarEventDTO[]): LaidOutEvent[] {
  const sorted = [...events].sort((a, b) => a.startTimeMs - b.startTimeMs);

  const columnEnds: number[] = []; // last endTimeMs assigned to each column
  const assignments: Array<{ event: CalendarEventDTO; col: number; clusterId: number }> = [];
  let clusterId = 0;
  let clusterEnd = -Infinity;

  for (const e of sorted) {
    if (e.startTimeMs >= clusterEnd && columnEnds.length > 0) {
      clusterId += 1;
      columnEnds.length = 0;
      clusterEnd = -Infinity;
    }
    let col = columnEnds.findIndex(end => end <= e.startTimeMs);
    if (col === -1) {
      col = columnEnds.length;
      columnEnds.push(e.endTimeMs);
    } else {
      columnEnds[col] = e.endTimeMs;
    }
    assignments.push({ event: e, col, clusterId });
    if (e.endTimeMs > clusterEnd) clusterEnd = e.endTimeMs;
  }

  // Per-cluster max column count
  const clusterColumnCount = new Map<number, number>();
  for (const a of assignments) {
    const cur = clusterColumnCount.get(a.clusterId) ?? 0;
    if (a.col + 1 > cur) clusterColumnCount.set(a.clusterId, a.col + 1);
  }

  return assignments.map(a => ({
    event: a.event,
    columnIndex: a.col,
    columnCount: clusterColumnCount.get(a.clusterId) ?? 1,
  }));
}

export function CalendarColumn({ workHoursStart, workHoursEnd }: Props) {
  const api = useRemirror();
  const [events, setEvents] = useState<CalendarEventDTO[]>([]);
  const [google, setGoogle] = useState<GoogleStatusDTO | null>(null);

  async function refresh(alive?: () => boolean) {
    const [ev, gs] = await Promise.all([api.calendarListToday(), api.googleStatus()]);
    if (alive && !alive()) return;
    setEvents(ev);
    setGoogle(gs);
  }

  useEffect(() => {
    let mounted = true;
    const alive = () => mounted;
    refresh(alive);
    const offGoogle = api.onGoogleStatusChanged(() => refresh(alive));
    const offSessions = api.onSessionsChanged(() => refresh(alive));
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') refresh(alive);
    }, 5000);
    return () => { mounted = false; offGoogle(); offSessions(); clearInterval(interval); };
  }, [api]);

  const { timeRangeStart, timeRangeEnd, pixelsPerMs, totalHeight } = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();
    let startMs = todayMs + 7 * 3_600_000;
    let endMs = todayMs + 22 * 3_600_000;
    if (events.length > 0) {
      const earliest = Math.min(...events.map(e => e.startTimeMs));
      const latest = Math.max(...events.map(e => e.endTimeMs));
      startMs = Math.min(startMs, earliest);
      endMs = Math.max(endMs, latest);
    }
    const totalHeight = 560;
    return { timeRangeStart: startMs, timeRangeEnd: endMs, pixelsPerMs: totalHeight / (endMs - startMs), totalHeight };
  }, [events]);

  function topFor(ms: number): number {
    return (ms - timeRangeStart) * pixelsPerMs;
  }

  const todayStart = new Date(timeRangeStart);
  todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();
  const whStart = todayMs + parseHHMM(workHoursStart, 9 * 60) * 60_000;
  const whEnd = todayMs + parseHHMM(workHoursEnd, 17 * 60) * 60_000;

  if (google && !google.connected) {
    return (
      <div className="p-6 relative bg-bg-deep" style={{ height: `${totalHeight + 60}px` }}>
        <div className="text-[10px] uppercase tracking-[1.5px] text-muted font-semibold mb-3.5">Calendar — what you planned</div>
        <div className="text-muted text-sm mt-12">
          Connect Google Calendar in the Schedule tab to see what you planned alongside what you did.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 relative bg-bg-deep" style={{ height: `${totalHeight + 60}px` }}>
      <div className="text-[10px] uppercase tracking-[1.5px] text-muted font-semibold mb-3.5">Calendar — what you planned</div>

      <div
        className="absolute left-[42px] right-[18px] bg-[rgba(93,196,176,0.06)] border-l border-[rgba(93,196,176,0.22)] rounded-[2px]"
        style={{ top: `${60 + topFor(whStart)}px`, height: `${(whEnd - whStart) * pixelsPerMs}px` }}
      />

      {layoutEvents(events).map(({ event, columnIndex, columnCount }) => (
        <CalendarEventBlock
          key={event.id}
          event={event}
          pixelsPerMs={pixelsPerMs}
          topOffsetPx={60 + topFor(event.startTimeMs)}
          columnIndex={columnIndex}
          columnCount={columnCount}
        />
      ))}

      <div className="absolute bottom-4 left-[42px] right-[18px] text-[10px] text-quiet leading-[1.6]">
        <div><span className="inline-block w-1.5 h-1.5 bg-accent rounded-full mr-1.5" />kept</div>
        <div><span className="inline-block w-1.5 h-1.5 bg-green rounded-full mr-1.5" />partial</div>
        <div><span className="inline-block w-1.5 h-1.5 bg-quiet rounded-full mr-1.5" />did not start</div>
      </div>

      {google?.lastError && (
        <div className="absolute top-12 right-4 text-[10px] text-sand">
          Calendar unavailable — {google.lastError}
        </div>
      )}
    </div>
  );
}
