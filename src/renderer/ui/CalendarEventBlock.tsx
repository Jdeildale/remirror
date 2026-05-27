import React from 'react';
import clsx from 'clsx';
import type { CalendarEventDTO } from '@shared/types';

interface Props {
  event: CalendarEventDTO;
  pixelsPerMs: number;
  topOffsetPx: number;
}

function dotColor(status: CalendarEventDTO['status']): string {
  switch (status) {
    case 'kept': return 'bg-accent';
    case 'partial': return 'bg-green';
    case 'did-not-start': return 'bg-quiet';
  }
}

function fmtRange(startMs: number, endMs: number): string {
  const fmt = (ts: number) => {
    const d = new Date(ts);
    const h = d.getHours();
    const m = d.getMinutes();
    const period = h >= 12 ? 'pm' : 'am';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return m === 0 ? `${h12}${period}` : `${h12}:${m.toString().padStart(2, '0')}${period}`;
  };
  return `${fmt(startMs)} – ${fmt(endMs)}`;
}

function statusLine(event: CalendarEventDTO): string {
  if (event.status === 'kept') return 'kept';
  if (event.status === 'partial') {
    const actual = Math.round(event.overlapMs / 60_000);
    const scheduled = Math.round((event.endTimeMs - event.startTimeMs) / 60_000);
    return `${actual} of ${scheduled} min`;
  }
  return 'did not start';
}

export function CalendarEventBlock({ event, pixelsPerMs, topOffsetPx }: Props) {
  const heightPx = Math.max(24, Math.round((event.endTimeMs - event.startTimeMs) * pixelsPerMs));
  return (
    <div
      className="absolute left-[42px] right-[18px] border border-purple rounded-[5px] bg-[rgba(200,154,240,0.10)] text-purple px-2.5 py-1.5"
      style={{ top: `${topOffsetPx}px`, height: `${heightPx}px`, fontSize: '11px' }}
    >
      <div className="font-bold flex items-center gap-1.5">
        <span className={clsx('inline-block w-1.5 h-1.5 rounded-full', dotColor(event.status))} />
        {event.title}
      </div>
      <div className="opacity-85 text-[10px] mt-0.5">
        {fmtRange(event.startTimeMs, event.endTimeMs)} · {statusLine(event)}
      </div>
    </div>
  );
}
