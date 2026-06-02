import React from 'react';
import clsx from 'clsx';
import type { Session } from '@shared/types';
import { cleanWindowTitle } from '@shared/clean-title';

interface Props {
  session: Session;
  pixelsPerMs: number;
  topOffsetPx: number;
  isLongestToday: boolean;
}

// Color stays project-driven so a quick visual scan still distinguishes
// "directional" project time from "everything else" time. Unclassified
// sessions (no project match) render in warm grey — they still get a
// readable NAME from the window title, but the color says "this wasn't
// in a defined project."
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

// Lowered from 20m → 10m so more sessions get readable labels, matching the
// "record of everything I did" intent. Anything shorter is too thin a sliver
// to fit text and would visually clutter.
const LABEL_THRESHOLD_MS = 10 * 60_000;

export function SessionBlock({ session, pixelsPerMs, topOffsetPx, isLongestToday }: Props) {
  if (!session.end_time) return null;
  const effectiveMs = Math.max(0, session.end_time - session.start_time - session.paused_ms);
  const heightPx = Math.max(4, Math.round(effectiveMs * pixelsPerMs));
  const showLabel = effectiveMs >= LABEL_THRESHOLD_MS;
  const colorClass = colorForProject(session.project_label);
  const textColor = textOnColor(session.project_label);
  const minutes = Math.round(effectiveMs / 60_000);

  // The display label is the cleaned window title — this is the "record of
  // everything I did" surface. The project label, when matched, is shown as
  // a small caps tag below so directional intent is still visible.
  const cleanedTitle = cleanWindowTitle(session.window_title, session.app_name);
  const hasProjectMatch =
    session.project_label && session.project_label !== 'unclassified';

  return (
    <div
      className={clsx(
        'absolute left-[30px] right-[18px] rounded-[5px] overflow-hidden',
        colorClass,
        textColor,
        showLabel ? 'px-3 py-1.5 font-semibold' : 'px-2',
      )}
      style={{ top: `${topOffsetPx}px`, height: `${heightPx}px` }}
      title={`${session.window_title ?? '(no title)'} · ${session.app_name ?? ''} · ${minutes} min`}
    >
      {showLabel && (
        <>
          <div className="truncate">
            {cleanedTitle} · {minutes} min
          </div>
          {hasProjectMatch && (
            <div className="text-[9px] uppercase tracking-[1px] opacity-70 mt-0.5 truncate">
              {session.project_label}
            </div>
          )}
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
