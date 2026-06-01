import React, { useState } from 'react';
import clsx from 'clsx';
import type { DailyBriefDTO } from '@shared/types';
import { Markdown } from './markdown';

interface Props { brief: DailyBriefDTO; }

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

export function PastBriefRow({ brief }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[rgba(250,247,240,0.05)]">
      <button
        className="w-full flex items-center justify-between py-3 text-left hover:bg-surface/30 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-baseline gap-3">
          <span className="text-text text-[13px] font-medium min-w-[6rem]">{fmtDate(brief.date)}</span>
          <span className="text-muted text-[12px] truncate max-w-[40rem]">{brief.headline}</span>
        </div>
        <span className={clsx('text-quiet text-xs transition-transform', open && 'rotate-90')}>&#9658;</span>
      </button>
      {open && (
        <div className="px-4 pb-4">
          <Markdown source={brief.rawMarkdown} />
        </div>
      )}
    </div>
  );
}
