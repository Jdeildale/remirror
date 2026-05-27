import React from 'react';
import clsx from 'clsx';
import type { ProjectBreakdownDTO } from '@shared/types';

interface Props {
  entries: ProjectBreakdownDTO[];
}

function fmtDuration(ms: number): string {
  const total = Math.floor(ms / 60_000);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function dotColorClass(label: string): string {
  if (label === 'unclassified') return 'bg-unclassified';
  switch (label.toLowerCase()) {
    case 'oracle': return 'bg-accent';
    case "jackie's website":
    case 'jackies website': return 'bg-purple';
    case 'twb course':
    case 'twb': return 'bg-green';
    default: return 'bg-accent';
  }
}

export function ProjectBreakdown({ entries }: Props) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[1.5px] text-muted font-semibold mb-2.5">Time by project</div>
      {entries.map((e) => (
        <div key={e.label} className="flex items-center gap-2 mb-2">
          <span className={clsx('w-2 h-2 rounded-[2px]', dotColorClass(e.label))} />
          <span className="text-[13px] text-text flex-1">{e.label === 'unclassified' ? 'Unclassified / other' : e.label}</span>
          <span className="text-[12px] text-muted">{fmtDuration(e.totalMs)}</span>
        </div>
      ))}
    </div>
  );
}
