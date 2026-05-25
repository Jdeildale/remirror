import React, { useState } from 'react';
import { ProjectEditor } from '../ui/ProjectEditor';
import { ExclusionEditor } from '../ui/ExclusionEditor';
import { Button } from '../ui/Button';
import { Logo } from '../ui/Logo';

interface Props { onComplete: () => void; }

type Step = 1 | 2 | 3;

export function Onboarding({ onComplete }: Props) {
  const [step, setStep] = useState<Step>(1);

  return (
    <div className="min-h-full p-10 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Logo size={36} color="#5fb6c4" />
        <span className="text-xl font-semibold tracking-tight">Remirror</span>
      </div>
      <div className="text-muted text-sm mb-2">Step {step} of 3</div>
      <h1 className="text-3xl font-semibold mb-6">
        {step === 1 && 'Tell Remirror what you work on'}
        {step === 2 && 'These apps are never recorded'}
        {step === 3 && "You're done"}
      </h1>

      {step === 1 && (
        <div className="space-y-6">
          <p className="text-muted">
            Add the projects you spend time on. Remirror will match your window titles and app names
            against these keywords to label sessions as you work.
          </p>
          <ProjectEditor />
          <Button onClick={() => setStep(2)}>Continue</Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <p className="text-muted">
            Password managers, banking sites, and private messaging are excluded by default.
            Add anything else you don't want recorded.
          </p>
          <ExclusionEditor />
          <Button onClick={() => setStep(3)}>Continue</Button>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6">
          <p className="text-lg">
            Capture starts now. Remirror lives in your tray.<br />
            Press <kbd className="px-2 py-1 bg-surface rounded">Alt+Shift+R</kbd> any time to open it.
          </p>
          <p className="text-muted text-sm">
            All data stays on this machine. No cloud, no telemetry, ever.
          </p>
          <Button onClick={onComplete}>Got it</Button>
        </div>
      )}
    </div>
  );
}
