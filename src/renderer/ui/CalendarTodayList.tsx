import React from 'react';
import clsx from 'clsx';
import type { CalendarEventDTO } from '@shared/types';

interface Props {
  events: CalendarEventDTO[];
}

function fmtStatusLine(event: CalendarEventDTO): { line: string; cls: string } {
  if (event.status === 'kept') {
    return { line: `✓ ${event.title} · kept`, cls: 'text-accent' };
  }
  if (event.status === 'partial') {
    const actual = Math.round(event.overlapMs / 60_000);
    const scheduled = Math.round((event.endTimeMs - event.startTimeMs) / 60_000);
    return { line: `✓ ${event.title} · partial (${actual} of ${scheduled} min)`, cls: 'text-accent' };
  }
  return { line: `— ${event.title} · did not start`, cls: 'text-muted' };
}

export function CalendarTodayList({ events }: Props) {
  if (events.length === 0) {
    return (
      <div className="bg-surface rounded-lg p-[14px] mb-5">
        <div className="text-[11px] text-muted font-semibold mb-2">Calendar today</div>
        <div className="text-[13px] text-muted">No events on your calendar today.</div>
      </div>
    );
  }
  return (
    <div className="bg-surface rounded-lg p-[14px] mb-5">
      <div className="text-[11px] text-muted font-semibold mb-2">Calendar today</div>
      <div className="text-[13px] leading-[1.8]">
        {events.map(e => {
          const { line, cls } = fmtStatusLine(e);
          return <div key={e.id} className={clsx(cls)}>{line}</div>;
        })}
      </div>
    </div>
  );
}
