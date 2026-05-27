import React from 'react';
import clsx from 'clsx';

interface Props {
  label: string;
  value: React.ReactNode;
  emphasize?: boolean; // highlights value in accent color
  className?: string;
}

export function StatCard({ label, value, emphasize, className }: Props) {
  return (
    <div className={clsx(
      'bg-surface rounded-lg p-[14px] border border-[rgba(250,247,240,0.07)]',
      className,
    )}>
      <div className={clsx('text-[11px] font-semibold', emphasize ? 'text-accent' : 'text-muted')}>{label}</div>
      <div className={clsx('text-[24px] font-bold mt-1', emphasize ? 'text-accent' : 'text-text')}>
        {value}
      </div>
    </div>
  );
}
