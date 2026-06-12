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

/**
 * v0.3.8 design: projects are no longer the primary axis. The mirror is the
 * trail of every screen, named. Every session ≥ 1 min displays its window
 * title; shorter sessions appear as thin slivers with hover-only details.
 *
 * Color is muted across the board — warm grey for everything. The user's
 * "directional vs everything else" lens didn't survive contact with real
 * usage (1700+ switches per day), where the project category was always
 * "unclassified". Color now exists only to give blocks shape, not meaning.
 */
const LABEL_THRESHOLD_MS = 1 * 60_000;
const TINY_THRESHOLD_MS = 3 * 60_000; // below this, just title (no minute count)

export function SessionBlock({ session, pixelsPerMs, topOffsetPx, isLongestToday }: Props) {
  if (!session.end_time) return null;
  const effectiveMs = Math.max(0, session.end_time - session.start_time - session.paused_ms);
  const heightPx = Math.max(4, Math.round(effectiveMs * pixelsPerMs));
  const showLabel = effectiveMs >= LABEL_THRESHOLD_MS;
  const minutes = Math.round(effectiveMs / 60_000);
  const cleanedTitle = cleanWindowTitle(session.window_title, session.app_name);

  return (
    <div
      className={clsx(
        'absolute left-[30px] right-[18px] rounded-[3px] overflow-hidden',
        'bg-unclassified text-text',
        showLabel ? (effectiveMs >= TINY_THRESHOLD_MS ? 'px-2 py-1 font-medium' : 'px-2 leading-none flex items-center') : 'px-2',
      )}
      style={{ top: `${topOffsetPx}px`, height: `${heightPx}px`, fontSize: effectiveMs >= TINY_THRESHOLD_MS ? '12px' : '10px' }}
      title={`${session.window_title ?? '(no title)'} · ${session.app_name ?? ''} · ${minutes} min`}
    >
      {showLabel && (
        <>
          {effectiveMs >= TINY_THRESHOLD_MS ? (
            <div className="truncate">
              {cleanedTitle} <span className="opacity-60 font-normal">· {minutes} min</span>
            </div>
          ) : (
            <div className="truncate text-quiet">
              {cleanedTitle}
            </div>
          )}
          {isLongestToday && (
            <span className="absolute right-2 top-1 text-[9px] bg-bg-deep text-accent px-1.5 py-0.5 rounded-[3px] font-bold">
              longest today
            </span>
          )}
        </>
      )}
    </div>
  );
}
