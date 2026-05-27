import React from 'react';
import type { DailyStatsDTO } from '@shared/types';

function fmt(ms: number): { h: number; m: number } {
  const total = Math.floor(ms / 60_000);
  return { h: Math.floor(total / 60), m: total % 60 };
}

function fmtBlockMin(ms: number): string {
  return `${Math.round(ms / 60_000)} min`;
}

function fmtTimeOfDay(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes();
  const period = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, '0')}${period}`;
}

interface Props {
  stats: DailyStatsDTO;
}

export function TruthHeadline({ stats }: Props) {
  const focused = fmt(stats.focusedMs);
  const elsewhere = fmt(stats.elsewhereMs);
  return (
    <div className="mb-5">
      <div className="text-[10px] uppercase tracking-[1.5px] text-muted font-semibold mb-2">Today</div>
      <p className="text-[19px] leading-[1.35] text-text font-medium m-0">
        <span className="text-accent font-bold">{focused.h} {focused.h === 1 ? 'hour' : 'hours'} {focused.m} {focused.m === 1 ? 'minute' : 'minutes'}</span> of focused work.{' '}
        <span className="text-text">{elsewhere.h} {elsewhere.h === 1 ? 'hour' : 'hours'} {elsewhere.m} {elsewhere.m === 1 ? 'minute' : 'minutes'}</span> elsewhere.
        {stats.longestBlock && (
          <>
            {' '}Longest stretch: <span className="text-accent font-bold">{fmtBlockMin(stats.longestBlock.durationMs)} on {stats.longestBlock.projectLabel}</span> at {fmtTimeOfDay(stats.longestBlock.startTime)}.
          </>
        )}
      </p>
    </div>
  );
}
