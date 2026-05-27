import React from 'react';
import clsx from 'clsx';
import type { Session } from '@shared/types';

interface Props {
  session: Session;
  pixelsPerMs: number;
  topOffsetPx: number;
  isLongestToday: boolean;
}

function colorForProject(label: string | null): string {
  if (!label || label === 'unclassified') return 'bg-unclassified';
  switch (label.toLowerCase()) {
    case 'oracle': return 'bg-accent';
    case "jackie's website":
    case 'jackies website': return 'bg-purple';
    case 'twb course':
    case 'twb': return 'bg-green';
    default: return 'bg-accent';
  }
}

function textOnColor(label: string | null): string {
  if (!label || label === 'unclassified') return 'text-text';
  return 'text-bg-deep';
}

export function SessionBlock({ session, pixelsPerMs, topOffsetPx, isLongestToday }: Props) {
  if (!session.end_time) return null;
  const effectiveMs = Math.max(0, session.end_time - session.start_time - session.paused_ms);
  const heightPx = Math.max(4, Math.round(effectiveMs * pixelsPerMs));
  const showLabel = effectiveMs >= 20 * 60_000;
  const colorClass = colorForProject(session.project_label);
  const textColor = textOnColor(session.project_label);

  return (
    <div
      className={clsx(
        'absolute left-[30px] right-[18px] rounded-[5px] overflow-hidden',
        colorClass,
        textColor,
        showLabel ? 'px-3 py-1.5 font-semibold' : 'px-2',
      )}
      style={{ top: `${topOffsetPx}px`, height: `${heightPx}px` }}
      title={`${session.window_title ?? '(no title)'} · ${session.app_name ?? ''} · ${Math.round(effectiveMs / 60_000)} min`}
    >
      {showLabel && (
        <>
          {session.project_label ?? 'unclassified'} · {Math.round(effectiveMs / 60_000)} min
          {isLongestToday && (
            <span className="absolute right-2.5 top-1.5 text-[9px] bg-bg-deep text-accent px-1.5 py-0.5 rounded-[3px] font-bold">
              longest today
            </span>
          )}
        </>
      )}
    </div>
  );
}
