import React from 'react';
import clsx from 'clsx';
import type { DailyBriefDTO, RegenStatusDTO } from '@shared/types';
import { Markdown } from './markdown';
import { Button } from './Button';

interface Props {
  brief: DailyBriefDTO | null;       // null while streaming or before any generation
  streamingMarkdown: string | null;  // non-null while a generation is in flight
  regenStatus: RegenStatusDTO;
  error: string | null;
  onGenerate: () => void;
  onRegenerate: () => void;
  busy: boolean;
}

export function BriefCard({ brief, streamingMarkdown, regenStatus, error, onGenerate, onRegenerate, busy }: Props) {
  // Streaming
  if (streamingMarkdown !== null) {
    return (
      <div className="bg-surface rounded-lg p-6 border border-[rgba(250,247,240,0.07)]">
        <Markdown source={streamingMarkdown} />
        <div className="mt-4 text-[11px] text-quiet flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 bg-accent rounded-full animate-pulse" />
          Writing…
        </div>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="bg-surface rounded-lg p-6 border border-[rgba(232,176,109,0.4)]">
        <div className="text-sand text-sm mb-3">Could not generate brief.</div>
        <div className="text-muted text-[13px] mb-4">{error}</div>
        <Button onClick={onGenerate} disabled={busy}>Retry</Button>
      </div>
    );
  }

  // No brief yet for today
  if (!brief) {
    return (
      <div className="bg-surface rounded-lg p-6 border border-[rgba(250,247,240,0.07)]">
        <div className="text-text text-sm mb-2">No brief for today yet.</div>
        <p className="text-muted text-[12px] mb-4 max-w-xl">
          Generating one will send today's aggregated stats (focus blocks, switches,
          calendar adherence, project breakdown) to the Anthropic API. ~$0.03 with Sonnet 4.5.
        </p>
        <Button onClick={onGenerate} disabled={busy}>Generate today's brief</Button>
      </div>
    );
  }

  // Complete brief
  return (
    <div className="bg-surface rounded-lg p-6 border border-[rgba(250,247,240,0.07)]">
      <Markdown source={brief.rawMarkdown} />
      <div className={clsx('mt-5 pt-4 border-t border-[rgba(250,247,240,0.07)] text-[11px] text-quiet flex flex-wrap items-center gap-x-3 gap-y-2')}>
        <span>Generated {new Date(brief.generatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
        <span>·</span>
        <span>{brief.model}</span>
        <span>·</span>
        <span>{brief.inputTokens.toLocaleString()} in + {brief.outputTokens.toLocaleString()} out tokens</span>
        <span>·</span>
        {regenStatus.locked ? (
          <span className="text-muted">This is the brief. Sit with it.</span>
        ) : (
          <>
            <span>{regenStatus.used} of {regenStatus.cap} regens used</span>
            <Button variant="ghost" onClick={onRegenerate} disabled={busy} className="text-[11px] px-2 py-1">Regenerate</Button>
          </>
        )}
      </div>
    </div>
  );
}
