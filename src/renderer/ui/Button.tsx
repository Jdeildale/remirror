import React from 'react';
import clsx from 'clsx';

type Variant = 'primary' | 'ghost' | 'danger';

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = 'primary', className, ...props }: Props) {
  const base = 'px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const v: Record<Variant, string> = {
    primary: 'bg-accent text-bg hover:opacity-90',
    ghost: 'bg-transparent text-text hover:bg-surface',
    danger: 'bg-surface text-text hover:bg-amber',
  };
  return <button className={clsx(base, v[variant], className)} {...props} />;
}
