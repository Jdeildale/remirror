import { BrowserWindow, webContents } from 'electron';
import { getDatabase } from '../db/index';
import { store } from '../store';
import { assembleBriefPayload } from './assemble-payload';
import { streamBriefGeneration } from '../anthropic/stream';
import type { StreamMessage, AbortableStream } from '../anthropic/stream';
import { SYSTEM_PROMPT_V1, bannedVocabRegenPrompt, parseFailRegenPrompt } from './prompts/v1';
import { parseBriefMarkdown } from './parse-markdown';
import { parseStructuredTail } from './parse-tail';
import { gateBrief, MAX_AUTO_REGENS_FOR_VIOLATIONS } from './gate';
import { BriefRepo } from './repo';
import { IPC } from '@shared/ipc-contract';
import type { DailyBriefDTO } from '@shared/types';
import { scanForBannedVocabulary } from '../copy/banned-vocab';
import log from '../log';

const PENDING_WINDOW = 50; // chars held back before painting to renderer (D.3)

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

/**
 * D.3: Creates a pending-delta buffer that holds back the last PENDING_WINDOW chars
 * from the renderer. If a banned word appears in the tail of the accumulated text,
 * the pending buffer is dropped (never emitted) and onBannedDetected() is called
 * so the caller can abort the stream and restart without flicker.
 */
function makePendingBufferCallbacks(
  originSenderId: number,
  generationId: string,
  onBannedDetected: () => void,
): {
  onTextDelta: (delta: string) => void;
  flush: () => void;
  drop: () => void;
  fullBuffer: () => string;
} {
  let pending = '';
  let full = '';
  let banned = false;

  return {
    onTextDelta(delta: string) {
      if (banned) return; // already detected — ignore further deltas
      full += delta;
      pending += delta;

      // Scan the tail of the full buffer for banned words (covers word boundaries)
      const tailToScan = full.slice(-80);
      const hits = scanForBannedVocabulary(tailToScan);
      if (hits.length > 0) {
        banned = true;
        // Drop pending — never emit it
        pending = '';
        onBannedDetected();
        return;
      }

      // Flush older portion of pending to renderer; keep last PENDING_WINDOW chars back
      if (pending.length > PENDING_WINDOW) {
        const toEmit = pending.slice(0, pending.length - PENDING_WINDOW);
        pending = pending.slice(-PENDING_WINDOW);
        sendToOrigin(originSenderId, IPC.BRIEF_STREAM, { kind: 'text_delta', generationId, delta: toEmit });
      }
    },
    flush() {
      if (pending.length > 0) {
        sendToOrigin(originSenderId, IPC.BRIEF_STREAM, { kind: 'text_delta', generationId, delta: pending });
        pending = '';
      }
    },
    drop() {
      pending = '';
    },
    fullBuffer() {
      return full;
    },
  };
}

export async function generateBrief(generationId: string, originSenderId: number): Promise<DailyBriefDTO> {
  const db = getDatabase();
  const repo = new BriefRepo(db);
  const now = new Date();
  const date = isoDate(now);

  // Snapshot existing generation count BEFORE streaming.
  // Only incremented on success — fallback exhaustion does NOT bump the count (D.5).
  const existing = repo.findByDate(date);
  const userGenCount = (existing?.generationCount ?? 0) + 1;

  const payload = assembleBriefPayload(db, now, {
    workHours: store.get('workHours'),
    goal: store.get('weeklyGoal') ?? null,
  });
  const userPayloadJson = JSON.stringify(payload);

  // D.6: accumulate token counts across all auto-regen attempts
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let model = '';
  let promptVersion = '';
  let rawMarkdown = '';

  // D.8: wall-clock cap — abort loop after 90s
  const startedAt = Date.now();

  // D.2: multi-turn messages array — assistant bad output + user correction are appended on regen
  const messages: StreamMessage[] = [{ role: 'user', content: userPayloadJson }];

  let attempt = 0;

  while (attempt < MAX_AUTO_REGENS_FOR_VIOLATIONS) {
    // D.8: wall-clock cap
    if (Date.now() - startedAt > 90_000) {
      log.warn(`Brief generation wall-clock cap (90s) exceeded after ${attempt} attempts; falling back`);
      break;
    }

    attempt += 1;

    // D.3: pending buffer — holds last PENDING_WINDOW chars back from renderer until confirmed clean
    let bannedDetected = false;
    let streamRef: AbortableStream | undefined;

    const buf = makePendingBufferCallbacks(
      originSenderId,
      generationId,
      () => {
        bannedDetected = true;
        if (streamRef) {
          try { streamRef.abort(); } catch { /* ignore */ }
        }
      },
    );

    const result = await streamBriefGeneration(
      messages,
      { onTextDelta: buf.onTextDelta },
      SYSTEM_PROMPT_V1,
    ).catch((err: unknown) => {
      // Abort throws — treat it as an expected interruption if bannedDetected
      if (bannedDetected) return null;
      throw err;
    });

    if (bannedDetected || result === null) {
      // Drop any remaining pending buffer — never shown to renderer
      buf.drop();
      // Signal renderer to clear streaming UI silently (no error shown)
      sendToOrigin(originSenderId, IPC.BRIEF_STREAM, { kind: 'reset_for_regen', generationId });
      rawMarkdown = buf.fullBuffer();
      // Build regen prompt from detected words
      const gate = gateBrief(rawMarkdown);
      const violatedWords = gate.violatedWords.length > 0 ? gate.violatedWords : ['[detected mid-stream]'];
      log.warn(`Brief attempt ${attempt}: banned vocab detected mid-stream: ${violatedWords.join(', ')}. Regenerating.`);
      messages.push({ role: 'assistant', content: rawMarkdown });
      messages.push({ role: 'user', content: bannedVocabRegenPrompt(violatedWords) });
      continue;
    }

    // Stream reference (for abort on future iterations if needed)
    streamRef = result.stream;
    // Flush remaining pending buffer on clean finish
    buf.flush();
    rawMarkdown = result.rawMarkdown;
    // D.6: accumulate, not overwrite
    totalInputTokens += result.inputTokens;
    totalOutputTokens += result.outputTokens;
    model = result.model;
    promptVersion = result.promptVersion;

    // Gate: banned vocab (catches anything that slipped past the mid-stream scanner)
    const gate = gateBrief(rawMarkdown);
    if (!gate.ok) {
      log.warn(`Brief attempt ${attempt}: banned vocab violations: ${gate.violatedWords.join(', ')}. Regenerating.`);
      const regenInstruction = bannedVocabRegenPrompt(gate.violatedWords);
      // D.2: append prior assistant output + correction request
      messages.push({ role: 'assistant', content: rawMarkdown });
      messages.push({ role: 'user', content: regenInstruction });
      continue;
    }

    // Parse sections
    const parse = parseBriefMarkdown(rawMarkdown);
    if (!parse.ok) {
      log.warn(`Brief attempt ${attempt}: parse failed, missing: ${parse.missing!.join(', ')}. Regenerating.`);
      const regenInstruction = parseFailRegenPrompt(parse.missing!);
      messages.push({ role: 'assistant', content: rawMarkdown });
      messages.push({ role: 'user', content: regenInstruction });
      continue;
    }

    // D.7: also require structured tail — retry if missing
    const tail = parseStructuredTail(rawMarkdown);
    if (tail === null) {
      log.warn(`Brief attempt ${attempt}: structured tail missing or invalid. Regenerating.`);
      const regenInstruction = parseFailRegenPrompt(['structured_tail_json']);
      messages.push({ role: 'assistant', content: rawMarkdown });
      messages.push({ role: 'user', content: regenInstruction });
      continue;
    }

    // All checks passed — store and return
    const brief: DailyBriefDTO = {
      date,
      generatedAt: Date.now(),
      generationCount: userGenCount,
      model,
      promptVersion,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
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

  // D.5: exhausted fallback — do NOT increment generationCount (skip upsert, emit error only).
  // The user retains their full regen budget for a brief they never received.
  log.warn(`Brief generation exhausted ${MAX_AUTO_REGENS_FOR_VIOLATIONS} auto-regen attempts; NOT storing, emitting error`);
  sendToOrigin(originSenderId, IPC.BRIEF_STREAM, {
    kind: 'error',
    generationId,
    message: `Brief generation could not produce a compliant response after ${MAX_AUTO_REGENS_FOR_VIOLATIONS} attempts. Please retry manually.`,
    retryable: true,
  });
  // Return a minimal stub so callers don't crash — not stored in DB
  return {
    date,
    generatedAt: Date.now(),
    generationCount: existing?.generationCount ?? 0,
    model,
    promptVersion,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    headline: '⚠ Auto-regeneration exhausted',
    story: rawMarkdown,
    whatHeld: '',
    whatFragmented: '',
    tomorrowFirst90: '',
    rawMarkdown,
    structuredTail: null,
  };
}
