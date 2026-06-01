import React from 'react';
import { Button } from './Button';

interface NoKeyProps { onSetupKey: () => void; }

export function NoApiKeyState({ onSetupKey }: NoKeyProps) {
  return (
    <div className="bg-surface rounded-lg p-6 border border-[rgba(250,247,240,0.07)]">
      <h3 className="text-text text-base font-semibold mb-2">Set up Claude to generate end-of-day reflections.</h3>
      <p className="text-muted text-[13px] mb-4 max-w-2xl leading-relaxed">
        Your data stays on this machine except when you generate a brief. At that
        moment, the day's aggregated stats are sent to the Anthropic API using your
        key. You provide your own key — it's never bundled, never logged, never proxied.
      </p>
      <Button onClick={onSetupKey}>Set up Anthropic API →</Button>
    </div>
  );
}
