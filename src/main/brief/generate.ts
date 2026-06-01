import { BrowserWindow, webContents } from 'electron';
import { getDatabase } from '../db/index';
import { store } from '../store';
import { assembleBriefPayload } from './assemble-payload';
import { streamBriefGeneration } from '../anthropic/stream';
import { SYSTEM_PROMPT_V1, bannedVocabRegenPrompt, parseFailRegenPrompt } from './prompts/v1';
import { parseBriefMarkdown } from './parse-markdown';
import { parseStructuredTail } from './parse-tail';
import { gateBrief, MAX_AUTO_REGENS_FOR_VIOLATIONS } from './gate';
import { BriefRepo } from './repo';
import { IPC } from '@shared/ipc-contract';
import type { DailyBriefDTO } from '@shared/types';
import log from '../log';

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function sendToOrigin(senderId: number, channel: string, payload: unknown): void {
  const wc = webContents.fromId(senderId);
  if (wc && !wc.isDestroyed()) {
    wc.send(channel, payload);
  } else {
    // Originating renderer is gone; fall back to broadcast to whatever remains
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send(channel, payload);
    }
  }
}

export async function generateBrief(generationId: string, originSenderId: number): Promise<DailyBriefDTO> {
  const db = getDatabase();
  const repo = new BriefRepo(db);
  const now = new Date();
  const date = isoDate(now);

  // Increment the user-visible generation count BEFORE the stream begins.
  // If a brief already exists, +1. If not, this generation is the first → count = 1.
  const existing = repo.findByDate(date);
  const userGenCount = (existing?.generationCount ?? 0) + 1;

  const payload = assembleBriefPayload(db, now, {
    workHours: store.get('workHours'),
    goal: store.get('weeklyGoal') ?? null,
  });
  const userMessage = JSON.stringify(payload);

  let systemPrompt: string = SYSTEM_PROMPT_V1;
  let attempt = 0;
  let rawMarkdown = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let model = '';
  let promptVersion = '';

  while (attempt < MAX_AUTO_REGENS_FOR_VIOLATIONS) {
    attempt += 1;

    // Stream
    const result = await streamBriefGeneration(
      userMessage,
      {
        onTextDelta: delta => sendToOrigin(originSenderId, IPC.BRIEF_STREAM, { kind: 'text_delta', generationId, delta }),
      },
      systemPrompt,
    );
    rawMarkdown = result.rawMarkdown;
    inputTokens = result.inputTokens;
    outputTokens = result.outputTokens;
    model = result.model;
    promptVersion = result.promptVersion;

    // Gate
    const gate = gateBrief(rawMarkdown);
    if (!gate.ok) {
      log.warn(`Brief attempt ${attempt}: banned vocab violations: ${gate.violatedWords.join(', ')}. Regenerating.`);
      systemPrompt = SYSTEM_PROMPT_V1 + '\n\n' + bannedVocabRegenPrompt(gate.violatedWords);
      continue;
    }

    // Parse sections
    const parse = parseBriefMarkdown(rawMarkdown);
    if (!parse.ok) {
      log.warn(`Brief attempt ${attempt}: parse failed, missing: ${parse.missing!.join(', ')}. Regenerating.`);
      systemPrompt = SYSTEM_PROMPT_V1 + '\n\n' + parseFailRegenPrompt(parse.missing!);
      continue;
    }

    // Success
    const tail = parseStructuredTail(rawMarkdown);
    const brief: DailyBriefDTO = {
      date,
      generatedAt: Date.now(),
      generationCount: userGenCount,
      model,
      promptVersion,
      inputTokens,
      outputTokens,
      headline: parse.sections!.headline,
      story: parse.sections!.story,
      whatHeld: parse.sections!.whatHeld,
      whatFragmented: parse.sections!.whatFragmented,
      tomorrowFirst90: parse.sections!.tomorrowFirst90,
      rawMarkdown,
      structuredTail: tail,
    };
    repo.upsert(brief);
    sendToOrigin(originSenderId, IPC.BRIEF_STREAM, { kind: 'done', generationId, brief });
    return brief;
  }

  // All auto-regen attempts exhausted. Store what we have with a warning.
  log.warn(`Brief generation exhausted ${MAX_AUTO_REGENS_FOR_VIOLATIONS} auto-regen attempts; storing with warning`);
  const fallbackBrief: DailyBriefDTO = {
    date,
    generatedAt: Date.now(),
    generationCount: userGenCount,
    model,
    promptVersion,
    inputTokens,
    outputTokens,
    headline: '⚠ Auto-regeneration exhausted',
    story: rawMarkdown,
    whatHeld: '',
    whatFragmented: '',
    tomorrowFirst90: '',
    rawMarkdown,
    structuredTail: null,
  };
  repo.upsert(fallbackBrief);
  sendToOrigin(originSenderId, IPC.BRIEF_STREAM, {
    kind: 'error',
    generationId,
    message: `Brief generation could not produce a compliant response after ${MAX_AUTO_REGENS_FOR_VIOLATIONS} attempts. Raw response stored — review and retry manually.`,
    retryable: true,
  });
  return fallbackBrief;
}
