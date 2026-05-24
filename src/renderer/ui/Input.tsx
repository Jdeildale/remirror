import React from 'react';
import clsx from 'clsx';

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        'w-full bg-surface text-text rounded-md px-3 py-2 outline-none ring-1 ring-transparent focus:ring-accent',
        className,
      )}
      {...props}
    />
  );
}
