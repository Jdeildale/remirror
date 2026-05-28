import React from 'react';
import clsx from 'clsx';
import type { CalendarEventDTO } from '@shared/types';

interface Props {
  event: CalendarEventDTO;
  pixelsPerMs: number;
  topOffsetPx: number;
  /** 0-indexed column position within its overlap cluster. Defaults to 0. */
  columnIndex?: number;
  /** Total columns in this event's overlap cluster. Defaults to 1 (full width). */
  columnCount?: number;
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

export function CalendarEventBlock({ event, pixelsPerMs, topOffsetPx, columnIndex = 0, columnCount = 1 }: Props) {
  const heightPx = Math.max(24, Math.round((event.endTimeMs - event.startTimeMs) * pixelsPerMs));

  // Lay out within the parent's `left: 42px; right: 18px` horizontal band
  // (matches the work-hours band). Available width = (100% - 60px). Each
  // overlap cluster subdivides that band into N equal columns with a small
  // gap so columns visually separate. columnCount=1 → unchanged full width.
  const gapPx = columnCount > 1 ? 2 : 0;
  const leftCss = `calc(42px + (100% - 60px) * ${columnIndex} / ${columnCount})`;
  const widthCss = `calc((100% - 60px) / ${columnCount} - ${gapPx}px)`;

  return (
    <div
      className="absolute border border-purple rounded-[5px] bg-[rgba(200,154,240,0.10)] text-purple px-2.5 py-1.5 overflow-hidden"
      style={{ top: `${topOffsetPx}px`, height: `${heightPx}px`, left: leftCss, width: widthCss, fontSize: '11px' }}
    >
      <div className="font-bold flex items-center gap-1.5 truncate">
        <span className={clsx('inline-block w-1.5 h-1.5 rounded-full flex-shrink-0', dotColor(event.status))} />
        <span className="truncate">{event.title}</span>
      </div>
      <div className="opacity-85 text-[10px] mt-0.5 truncate">
        {fmtRange(event.startTimeMs, event.endTimeMs)} · {statusLine(event)}
      </div>
    </div>
  );
}
