# Batch D — Brief Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply all 12 Batch D sub-items from the v0.3.0 audit fix plan — covering multi-turn regen context, streaming banned-vocab abort, token accumulation, wall-clock cap, key scrubbing, parse-tail robustness, and dead-code removal.

**Architecture:** All changes are confined to `src/main/brief/`, `src/main/anthropic/`, `src/shared/types.ts`, and `src/renderer/routes/Brief.tsx`. The streaming refactor (`StreamMessage[]` API) is the load-bearing change that D.2, D.3, D.5, D.6, D.7, and D.8 build on — do D.2 first.

**Tech Stack:** TypeScript, Electron main process, `@anthropic-ai/sdk` v0.98, Vitest.

---

## ABI Sanity Check (do before any task)

- [ ] **Rebuild SQLite for Node (test mode)**

```bash
npm run rebuild:node
```

- [ ] **Run a single DB test to confirm Node ABI is valid**

```bash
npx vitest run tests/db.test.ts
```

Expected: PASS. If NODE_MODULE_VERSION mismatch error appears, stop — ABI is broken and needs manual repair before proceeding.

---

## Skipped items (already complete)

- **D.1** — Concurrent generation guard: `inFlightByDate` Map already present in `src/main/ipc.ts` lines 304–326. Skip.
- **D.4** — safeStorage marker: covered in Batch A.9. Skip.
- **D.7** — Retry on `parseStructuredTail` null: will be naturally covered by D.2's refactored loop condition `if (gate.ok && parse.ok && tail !== null) break`. No separate commit needed.

---

## Task D.2 — Refactor streamBriefGeneration to accept messages array + pass prior assistant turn on regen

**Files:**
- Modify: `src/main/anthropic/stream.ts`
- Modify: `src/main/brief/generate.ts`

### Why this is first

Every subsequent task (D.3, D.5, D.6, D.8) touches `generate.ts`'s while-loop. D.2 rewrites that loop's structure. Do this first so later tasks patch into the new shape.

- [ ] **Step 1: Update `stream.ts` — add `StreamMessage` type and change signature**

Replace the entire file `src/main/anthropic/stream.ts` with:

```typescript
import { getAnthropicClient, getConfiguredModel, anthropicErrorMessage } from './client';
import { SYSTEM_PROMPT_V1, PROMPT_VERSION } from '../brief/prompts/v1';
import type Anthropic from '@anthropic-ai/sdk';
import log from '../log';

export interface StreamMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface StreamCallbacks {
  onTextDelta: (delta: string) => void;
  onUsage?: (usage: { inputTokens: number; outputTokens: number }) => void;
}

export interface StreamResult {
  rawMarkdown: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  promptVersion: string;
  /** The MessageStream object — callers may call .abort() on it for early exit. */
  stream?: Anthropic.MessageStream;
}

/**
 * Streams a brief generation. Accepts a messages array to support multi-turn
 * regen context (prior assistant output + user correction request).
 * Returns the assembled full Markdown plus usage.
 * Callers handle parsing, gating, retries.
 */
export async function streamBriefGeneration(
  messages: StreamMessage[],
  callbacks: StreamCallbacks,
  systemPromptOverride?: string,
): Promise<StreamResult> {
  const client = getAnthropicClient();
  const model = getConfiguredModel();

  let full = '';
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const stream = client.messages.stream({
      model,
      max_tokens: 4096,
      system: systemPromptOverride ?? SYSTEM_PROMPT_V1,
      messages: messages as Anthropic.MessageParam[],
    });

    stream.on('text', (delta: string) => {
      full += delta;
      callbacks.onTextDelta(delta);
    });

    const message = await stream.finalMessage();
    inputTokens = message.usage?.input_tokens ?? 0;
    outputTokens = message.usage?.output_tokens ?? 0;
    if (callbacks.onUsage) callbacks.onUsage({ inputTokens, outputTokens });

    return { rawMarkdown: full, inputTokens, outputTokens, model, promptVersion: PROMPT_VERSION, stream };
  } catch (e) {
    const msg = anthropicErrorMessage(e);
    log.warn('Brief stream failed:', msg);
    throw new Error(msg);
  }
}
```

- [ ] **Step 2: Rewrite the while-loop in `generate.ts` to use messages array + accumulate tokens + handle tail null**

Replace the entire `generate.ts` file with:

```typescript
import { BrowserWindow, webContents } from 'electron';
import { getDatabase } from '../db/index';
import { store } from '../store';
import { assembleBriefPayload } from './assemble-payload';
import { streamBriefGeneration } from '../anthropic/stream';
import type { StreamMessage } from '../anthropic/stream';
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

  // Snapshot the existing generation count BEFORE streaming.
  // Only incremented on success; fallback exhaustion does NOT bump the count.
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

    const result = await streamBriefGeneration(
      messages,
      {
        onTextDelta: delta => sendToOrigin(originSenderId, IPC.BRIEF_STREAM, { kind: 'text_delta', generationId, delta }),
      },
      SYSTEM_PROMPT_V1,
    );
    rawMarkdown = result.rawMarkdown;
    // D.6: accumulate, not overwrite
    totalInputTokens += result.inputTokens;
    totalOutputTokens += result.outputTokens;
    model = result.model;
    promptVersion = result.promptVersion;

    // Gate: banned vocab
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
      log.warn(`Brief attempt ${attempt}: structured tail missing. Regenerating.`);
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

  // D.5: exhausted fallback — do NOT increment generationCount (skip upsert, emit error only)
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
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: 0 errors. If there are type errors on `messages as Anthropic.MessageParam[]`, the SDK type for role is `'user' | 'assistant'` — the cast is correct. If needed, import `MessageParam` from `@anthropic-ai/sdk` and use that type instead of the cast.

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/brief/
```

Expected: all existing brief tests pass. (No new tests for D.2 — the behavior is tested indirectly by D.5 and D.6 tests in later tasks.)

- [ ] **Step 5: Commit**

```bash
git add src/main/anthropic/stream.ts src/main/brief/generate.ts
git commit -m "fix(brief): include prior assistant turn on auto-regen (better correction context)"
```

---

## Task D.3 — Streaming banned-vocab abort with no visible flicker

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/brief/generate.ts`
- Modify: `src/main/anthropic/stream.ts`
- Modify: `src/renderer/routes/Brief.tsx`

### Context

The Mercer-locked requirement: if banned vocab appears mid-stream, drop the pending buffer before the renderer ever paints it, then silently restart. The renderer sees a brief pause, not a visible reset.

The Anthropic SDK's `MessageStream` object (returned by `client.messages.stream(...)`) exposes a `.abort()` method that cancels the underlying HTTP request and causes the `await stream.finalMessage()` call to reject with an abort error. We use this to cut the stream early.

The 50-char sliding buffer strategy: we hold the last 50 chars of streamed output in a `pendingDelta` buffer and only flush older content to the renderer. When a banned word is detected, the pending buffer is dropped (never sent) and abort is called.

- [ ] **Step 1: Add `reset_for_regen` to `BriefStreamEvent` in `src/shared/types.ts`**

Find the `BriefStreamEvent` type (currently lines 116–120) and add the new variant:

```typescript
export type BriefStreamEvent =
  | { kind: 'text_delta'; generationId: string; delta: string }
  | { kind: 'section_complete'; generationId: string; section: 'headline' | 'story' | 'what_held' | 'what_fragmented' | 'tomorrow_first_90' }
  | { kind: 'done'; generationId: string; brief: DailyBriefDTO }
  | { kind: 'error'; generationId: string; message: string; retryable: boolean }
  | { kind: 'reset_for_regen'; generationId: string };
```

- [ ] **Step 2: Update `stream.ts` to support an abort signal + pending-delta buffer**

Add an optional `abortController` to `StreamCallbacks` and thread it through:

```typescript
export interface StreamCallbacks {
  onTextDelta: (delta: string) => void;
  onUsage?: (usage: { inputTokens: number; outputTokens: number }) => void;
  /** Called when a banned word is detected mid-stream. Stream will be aborted. */
  onBannedWordDetected?: () => void;
}
```

Then update `streamBriefGeneration` to accept a `bannedWordScanner` optional callback on the text event path. The scanner is called by the orchestrator (generate.ts), not stream.ts itself — stream.ts just exposes the `stream` object reference so the caller can call `stream.abort()`.

The `stream` reference is already returned in the `StreamResult` after D.2. No further changes to `stream.ts` are needed for D.3 — the abort mechanism is already threaded through.

- [ ] **Step 3: Rewrite the `onTextDelta` callback in `generate.ts` to buffer + scan**

In `generate.ts`, replace the inline `onTextDelta` with a factory function that maintains the pending buffer. Add this helper above `generateBrief`:

```typescript
const PENDING_WINDOW = 50; // chars held back before painting to renderer

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

  return {
    onTextDelta(delta: string) {
      full += delta;
      pending += delta;

      // Scan the tail of the full buffer for banned words (covers word boundaries)
      const tailToScan = full.slice(-80);
      const hits = scanForBannedVocabulary(tailToScan);
      if (hits.length > 0) {
        // Drop pending — never emit it. Caller will abort the stream.
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
```

Import `scanForBannedVocabulary` at the top of `generate.ts`:
```typescript
import { scanForBannedVocabulary } from '../copy/banned-vocab';
```

- [ ] **Step 4: Wire the pending buffer into the while-loop**

Inside the while-loop in `generateBrief`, replace the raw `onTextDelta` callback with the buffered factory. The loop body becomes:

```typescript
let bannedDetected = false;
let streamRef: import('../anthropic/stream').StreamResult['stream'] | undefined;

const buf = makePendingBufferCallbacks(
  originSenderId,
  generationId,
  () => {
    bannedDetected = true;
    // Abort the Anthropic stream to stop token spend
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
  // Signal renderer to clear streaming UI silently
  sendToOrigin(originSenderId, IPC.BRIEF_STREAM, { kind: 'reset_for_regen', generationId });
  // rawMarkdown may be partial — gate.ts will confirm ban; set it from buf
  rawMarkdown = buf.fullBuffer();
} else {
  streamRef = result.stream;
  // Flush remaining pending buffer on clean finish
  buf.flush();
  rawMarkdown = result.rawMarkdown;
  totalInputTokens += result.inputTokens;
  totalOutputTokens += result.outputTokens;
  model = result.model;
  promptVersion = result.promptVersion;
}
```

Note: when `bannedDetected` is true, we skip the normal gate/parse checks and jump to appending regen messages. We can check `bannedDetected` before the gate:

```typescript
if (!bannedDetected) {
  const gate = gateBrief(rawMarkdown);
  // ... normal gate/parse/tail checks ...
} else {
  // Banned word was detected mid-stream — build regen from the partial raw
  const gate = gateBrief(rawMarkdown);
  const regenInstruction = bannedVocabRegenPrompt(gate.violatedWords.length > 0 ? gate.violatedWords : ['[detected mid-stream]']);
  messages.push({ role: 'assistant', content: rawMarkdown });
  messages.push({ role: 'user', content: regenInstruction });
  continue;
}
```

- [ ] **Step 5: Handle `reset_for_regen` in `Brief.tsx`**

In `src/renderer/routes/Brief.tsx`, find the stream event handler (in the `useEffect`). Add handling for the new event kind:

```typescript
} else if (e.kind === 'reset_for_regen') {
  // Silently clear streaming state — regen is starting, no error to show
  setStreamingMarkdown('');
}
```

The full event handler block should be:

```typescript
const off = api.onBriefStream((e: BriefStreamEvent) => {
  if (activeGenId.current && e.generationId !== activeGenId.current) return;
  if (e.kind === 'text_delta') {
    setStreamingMarkdown(prev => (prev ?? '') + e.delta);
  } else if (e.kind === 'reset_for_regen') {
    setStreamingMarkdown('');
  } else if (e.kind === 'done') {
    activeGenId.current = null;
    setStreamingMarkdown(null);
    setError(null);
    setBusy(false);
    refresh();
  } else if (e.kind === 'error') {
    activeGenId.current = null;
    setStreamingMarkdown(null);
    setError(e.message);
    setBusy(false);
  }
});
```

- [ ] **Step 6: Run typecheck**

```bash
npm run typecheck
```

Expected: 0 errors. The `StreamResult['stream']` reference is `Anthropic.MessageStream | undefined` — if TypeScript complains, cast `result.stream` to `{ abort(): void } | undefined`.

- [ ] **Step 7: Run tests**

```bash
npx vitest run tests/brief/
```

Expected: all existing tests pass. (No automated test for the streaming abort path — it requires a live Anthropic connection. The behavior is verified by the guard logic in generate.ts.)

- [ ] **Step 8: Commit**

```bash
git add src/shared/types.ts src/main/brief/generate.ts src/main/anthropic/stream.ts src/renderer/routes/Brief.tsx
git commit -m "fix(brief): streaming banned-vocab abort with no visible flicker (Mercer-locked)"
```

---

## Task D.5 — Don't increment generation_count on exhausted-auto-regen failure

**Files:**
- Modify: `src/main/brief/generate.ts`

This was applied in D.2's rewrite — the fallback path now does NOT call `repo.upsert(fallbackBrief)`. Verify this is the case, then write a targeted test.

- [ ] **Step 1: Verify the fallback path in generate.ts does not call repo.upsert**

Read `src/main/brief/generate.ts` — confirm the fallback block after the while-loop contains no `repo.upsert(...)` call. If the D.2 rewrite was applied correctly, the fallback block only calls `sendToOrigin(...)` with the error event and returns a stub.

- [ ] **Step 2: Write a test that verifies generation_count is not bumped on failure**

Add to `tests/brief/generate-fallback.test.ts` (new file):

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test the logic by checking BriefRepo.upsert is never called when
// all auto-regen attempts are exhausted. We mock the dependencies.
vi.mock('@main/anthropic/stream', () => ({
  streamBriefGeneration: vi.fn().mockImplementation(async (_msgs, callbacks) => {
    // Return a response that always fails gate (banned word)
    callbacks.onTextDelta('This brief failed and you should feel bad about it.');
    return {
      rawMarkdown: 'This brief failed and you should feel bad about it.',
      inputTokens: 10,
      outputTokens: 20,
      model: 'claude-sonnet-4-5',
      promptVersion: 'v1.0',
    };
  }),
}));

vi.mock('@main/brief/assemble-payload', () => ({
  assembleBriefPayload: vi.fn().mockReturnValue({ date: '2026-06-01' }),
}));

vi.mock('@main/db/index', () => ({
  getDatabase: vi.fn().mockReturnValue({}),
}));

vi.mock('@main/store', () => ({
  store: { get: vi.fn().mockReturnValue({ enabled: false }) },
}));

vi.mock('@main/brief/repo', () => {
  const upsert = vi.fn();
  const findByDate = vi.fn().mockReturnValue(null);
  return { BriefRepo: vi.fn().mockImplementation(() => ({ upsert, findByDate })) };
});

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: vi.fn().mockReturnValue([]) },
  webContents: { fromId: vi.fn().mockReturnValue(null) },
}));

import { generateBrief } from '@main/brief/generate';
import { BriefRepo } from '@main/brief/repo';

describe('generateBrief fallback path', () => {
  it('does NOT call repo.upsert when all auto-regen attempts are exhausted', async () => {
    await generateBrief('gen-1', 999);
    const repoInstance = (BriefRepo as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(repoInstance.upsert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the new test**

```bash
npx vitest run tests/brief/generate-fallback.test.ts
```

Expected: PASS. If the mock setup fails to resolve aliases, check `vitest.config.ts` for `@main/` alias resolution. If the vi.mock for stream module doesn't intercept correctly, move the mock before the import.

- [ ] **Step 4: Commit**

```bash
git add tests/brief/generate-fallback.test.ts
git commit -m "fix(brief): don't consume regen quota on exhausted-auto-regen failure"
```

---

## Task D.6 — Accumulate token counts across all auto-regen attempts

**Files:**
- Modify: `src/main/brief/generate.ts`

This was applied in D.2's rewrite — `totalInputTokens` and `totalOutputTokens` are initialized before the loop and `+=` is used inside. Verify only.

- [ ] **Step 1: Confirm generate.ts uses `totalInputTokens +=` and `totalOutputTokens +=` inside the while-loop**

Read lines around `totalInputTokens` in `src/main/brief/generate.ts`. The pattern should be:

```typescript
let totalInputTokens = 0;
let totalOutputTokens = 0;
// ... in loop:
totalInputTokens += result.inputTokens;
totalOutputTokens += result.outputTokens;
```

If D.2 was applied correctly this is already in place.

- [ ] **Step 2: Write a test verifying token accumulation**

Add to `tests/brief/token-accumulation.test.ts` (new file):

```typescript
import { describe, it, expect, vi } from 'vitest';

let callCount = 0;
vi.mock('@main/anthropic/stream', () => ({
  streamBriefGeneration: vi.fn().mockImplementation(async (_msgs, callbacks) => {
    callCount += 1;
    // First two calls return banned-vocab output; third returns valid output
    if (callCount < 3) {
      callbacks.onTextDelta('You should have done better today.');
      return {
        rawMarkdown: 'You should have done better today.',
        inputTokens: 100,
        outputTokens: 50,
        model: 'claude-sonnet-4-5',
        promptVersion: 'v1.0',
      };
    }
    const md = `## Truth headline\nYou worked 4 hours.\n\n## Today's story\nThings happened.\n\n## What held\nFocus blocks.\n\n## What fragmented\nNone specifically.\n\n## Tomorrow's first 90\n09:00 — Oracle dashboard.\n\n\`\`\`json\n{"day_shape":"anchored","dominant_fragmentation_pattern":"none","tomorrow_first_90":{"start_local":"09:00","target":"Oracle","supporting_event_id":null,"competing_event_id":null}}\n\`\`\``;
    callbacks.onTextDelta(md);
    return {
      rawMarkdown: md,
      inputTokens: 200,
      outputTokens: 150,
      model: 'claude-sonnet-4-5',
      promptVersion: 'v1.0',
    };
  }),
}));

vi.mock('@main/brief/assemble-payload', () => ({
  assembleBriefPayload: vi.fn().mockReturnValue({ date: '2026-06-01' }),
}));

vi.mock('@main/db/index', () => ({
  getDatabase: vi.fn().mockReturnValue({}),
}));

vi.mock('@main/store', () => ({
  store: { get: vi.fn().mockReturnValue({ enabled: false }) },
}));

vi.mock('@main/brief/repo', () => {
  const upsert = vi.fn();
  const findByDate = vi.fn().mockReturnValue(null);
  return { BriefRepo: vi.fn().mockImplementation(() => ({ upsert, findByDate })) };
});

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: vi.fn().mockReturnValue([]) },
  webContents: { fromId: vi.fn().mockReturnValue(null) },
}));

import { generateBrief } from '@main/brief/generate';
import { BriefRepo } from '@main/brief/repo';

describe('token accumulation', () => {
  it('stores sum of tokens across all auto-regen attempts', async () => {
    callCount = 0;
    await generateBrief('gen-token', 999);
    const repoInstance = (BriefRepo as ReturnType<typeof vi.fn>).mock.results[0].value;
    const stored = repoInstance.upsert.mock.calls[0][0];
    // 2 failed attempts (100+100 in, 50+50 out) + 1 success (200 in, 150 out)
    expect(stored.inputTokens).toBe(400);
    expect(stored.outputTokens).toBe(250);
  });
});
```

- [ ] **Step 3: Run the test**

```bash
npx vitest run tests/brief/token-accumulation.test.ts
```

Expected: PASS. If vitest module mocking fails (ESM interop issues), check that `vi.mock` calls appear before any imports from the mocked modules — place them at the very top of the file after the `import { describe, it, expect, vi } from 'vitest'` line.

- [ ] **Step 4: Commit**

```bash
git add tests/brief/token-accumulation.test.ts
git commit -m "fix(brief): accumulate token counts across all auto-regen attempts"
```

---

## Task D.8 — 90s wall-clock cap on auto-regen loop

**Files:**
- Modify: `src/main/brief/generate.ts`
- Modify: `src/shared/ipc-contract.ts`

The wall-clock cap was applied in D.2's rewrite. Verify and add `BRIEF_CANCEL` channel as a stub (deferred from full AbortController wiring, which is v0.3.2 scope).

- [ ] **Step 1: Verify the wall-clock cap in generate.ts**

Read the while-loop in `src/main/brief/generate.ts`. Confirm:
```typescript
const startedAt = Date.now();
// ... in loop:
if (Date.now() - startedAt > 90_000) {
  log.warn(`...`);
  break;
}
```
If correct from D.2, no file change needed.

- [ ] **Step 2: Add `BRIEF_CANCEL` to the IPC contract as a deferred stub**

In `src/shared/ipc-contract.ts`, add to the `IPC` const:

```typescript
// Brief (continued)
BRIEF_CANCEL: 'brief:cancel',
```

And add to `RemirrorAPI`:

```typescript
/** Cancel an in-flight brief generation. No-op if generationId is not in-flight. Deferred: v0.3.2 */
briefCancel(generationId: string): Promise<void>;
```

- [ ] **Step 3: Add a stub IPC handler in `src/main/ipc.ts`**

After the `BRIEF_REGEN_STATUS` handler, add:

```typescript
ipcMain.handle(IPC.BRIEF_CANCEL, (_e, generationId: unknown): void => {
  // DEFERRED: v0.3.2 — full AbortController wiring per audit D.8
  // For now, log and no-op so callers don't error
  const id = typeof generationId === 'string' ? generationId : '(unknown)';
  log.info(`BRIEF_CANCEL received for ${id} — not yet wired (deferred)`);
});
```

- [ ] **Step 4: Expose `briefCancel` in preload**

In `src/preload/index.ts`, find where `briefGenerate` is exposed and add below it:

```typescript
briefCancel: (generationId: string) => ipcRenderer.invoke(IPC.BRIEF_CANCEL, generationId),
```

- [ ] **Step 5: Run typecheck**

```bash
npm run typecheck
```

Expected: 0 errors. If `RemirrorAPI` doesn't match preload, fix the exposed shape.

- [ ] **Step 6: Commit**

```bash
git add src/main/brief/generate.ts src/shared/ipc-contract.ts src/main/ipc.ts src/preload/index.ts
git commit -m "fix(brief): 90s wall-clock cap + BRIEF_CANCEL channel (deferred: full wiring in v0.3.2)"
```

---

## Task D.9 — Scrub API key from error messages and logs

**Files:**
- Modify: `src/main/anthropic/client.ts`
- Modify: `src/main/anthropic/stream.ts`

- [ ] **Step 1: Add `scrubKey` helper and apply it in `client.ts`**

In `src/main/anthropic/client.ts`, add after the imports:

```typescript
function scrubKey(text: string): string {
  return text.replace(/sk-ant-[A-Za-z0-9_-]+/g, 'sk-ant-***');
}
```

Then update `anthropicErrorMessage` to apply it to the return value:

```typescript
export function anthropicErrorMessage(err: unknown): string {
  let msg: string;
  if (err && typeof err === 'object') {
    const e = err as { status?: number; message?: string; error?: { message?: string } };
    if (e.status === 401) msg = 'Invalid API key. Update it in Settings.';
    else if (e.status === 429) msg = 'Rate limited by Anthropic. Try again in a moment.';
    else if (e.status === 403) msg = 'API key lacks permission for the selected model.';
    else if (e.status && e.status >= 500) msg = 'Anthropic service unavailable. Try again later.';
    else if (e.error?.message) msg = e.error.message;
    else if (e.message) msg = e.message;
    else msg = String(err);
  } else {
    msg = String(err);
  }
  return scrubKey(msg);
}
```

Also apply scrubKey to the `log.warn` call in `testConnection`:

```typescript
log.warn('Anthropic testConnection failed:', scrubKey(msg));
```

- [ ] **Step 2: Apply scrubKey in `stream.ts`**

In `src/main/anthropic/stream.ts`, the catch block logs `msg`. Import `anthropicErrorMessage` is already used — since `anthropicErrorMessage` now scrubs internally, no extra change is needed. But to be safe, also scrub the raw log call:

```typescript
} catch (e) {
  const msg = anthropicErrorMessage(e);
  log.warn('Brief stream failed:', msg); // msg already scrubbed by anthropicErrorMessage
  throw new Error(msg);
}
```

No change needed if `anthropicErrorMessage` already scrubs — just verify the log.warn call uses `msg` (the scrubbed result), not `e` directly.

- [ ] **Step 3: Write a test for key scrubbing**

Add to `tests/anthropic/scrub-key.test.ts` (new file):

```typescript
import { describe, it, expect } from 'vitest';
import { anthropicErrorMessage } from '@main/anthropic/client';

describe('anthropicErrorMessage key scrubbing', () => {
  it('scrubs a raw sk-ant key from an error message', () => {
    const err = { message: 'Request failed with key sk-ant-api03-abc123XYZ_longkeyvalue' };
    const result = anthropicErrorMessage(err);
    expect(result).not.toContain('sk-ant-api03-abc123XYZ_longkeyvalue');
    expect(result).toContain('sk-ant-***');
  });

  it('scrubs a key embedded mid-sentence', () => {
    const err = { message: 'Authentication failed: apiKey=sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx is invalid' };
    const result = anthropicErrorMessage(err);
    expect(result).not.toMatch(/sk-ant-api03-x+/);
  });

  it('returns status-mapped messages unchanged for numeric error codes', () => {
    expect(anthropicErrorMessage({ status: 401 })).toBe('Invalid API key. Update it in Settings.');
    expect(anthropicErrorMessage({ status: 429 })).toBe('Rate limited by Anthropic. Try again in a moment.');
  });
});
```

- [ ] **Step 4: Run the test**

```bash
npx vitest run tests/anthropic/scrub-key.test.ts
```

Expected: PASS. Make sure the `tests/anthropic/` directory exists; create it if needed (the file create above handles it).

- [ ] **Step 5: Run all tests**

```bash
npx vitest run tests/
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/main/anthropic/client.ts src/main/anthropic/stream.ts tests/anthropic/scrub-key.test.ts
git commit -m "fix(anthropic): scrub API key from error messages and logs"
```

---

## Task D.10 — parseStructuredTail picks the LAST json block

**Files:**
- Modify: `src/main/brief/parse-tail.ts`
- Modify: `tests/brief/parse-tail.test.ts`

- [ ] **Step 1: Write the failing test first**

Add to `tests/brief/parse-tail.test.ts`:

```typescript
it('picks the LAST json block when multiple json blocks exist (defense vs prompt drift)', () => {
  const md = `## Truth headline
Some copy here showing an example JSON structure:

\`\`\`json
{"this_is": "an_inline_example_not_the_tail"}
\`\`\`

## Tomorrow's first 90
09:00 — Oracle dashboard.

\`\`\`json
{
  "day_shape": "anchored",
  "dominant_fragmentation_pattern": "none",
  "tomorrow_first_90": {
    "start_local": "09:00",
    "target": "Oracle dashboard",
    "supporting_event_id": null,
    "competing_event_id": null
  }
}
\`\`\``;

  const result = parseStructuredTail(md);
  expect(result).not.toBeNull();
  expect(result!.dayShape).toBe('anchored');
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run tests/brief/parse-tail.test.ts
```

Expected: the new test FAILS because the current implementation uses `.match(...)` (first match) — the inline example `{"this_is": "an_inline_example"}` doesn't validate and returns `null`, but the test expects `anchored`.

Actually the first block will fail JSON validation (missing required fields) and return null, making the test actually pass. Let's adjust: make the inline example a valid but wrong structured tail:

Revise the new test case inline example to use a valid-but-wrong block:

```typescript
it('picks the LAST json block when an earlier valid-looking block exists', () => {
  // The first block looks like valid structured tail but has wrong day_shape
  // The second is the real tail with correct values
  const firstBlock = JSON.stringify({
    day_shape: 'diffuse',
    dominant_fragmentation_pattern: 'none',
    tomorrow_first_90: { start_local: '07:00', target: 'Fake target', supporting_event_id: null, competing_event_id: null },
  });
  const realBlock = JSON.stringify({
    day_shape: 'anchored',
    dominant_fragmentation_pattern: 'morning_drift',
    tomorrow_first_90: { start_local: '09:00', target: 'Oracle dashboard', supporting_event_id: null, competing_event_id: null },
  });
  const md = `## Story\nSome text.\n\n\`\`\`json\n${firstBlock}\n\`\`\`\n\n## Tomorrow\nFoo.\n\n\`\`\`json\n${realBlock}\n\`\`\``;

  const result = parseStructuredTail(md);
  expect(result).not.toBeNull();
  // Should pick the LAST block, not the first
  expect(result!.dayShape).toBe('anchored');
  expect(result!.tomorrowFirst90.target).toBe('Oracle dashboard');
});
```

- [ ] **Step 3: Run test to confirm it now actually fails (first match returns 'diffuse')**

```bash
npx vitest run tests/brief/parse-tail.test.ts
```

Expected: the new test FAILS — current code picks the first block (`diffuse`), not `anchored`.

- [ ] **Step 4: Fix `parse-tail.ts` to use the last match**

In `src/main/brief/parse-tail.ts`, replace line 7:

```typescript
const match = markdown.match(/```json\s*([\s\S]*?)```/);
```

with:

```typescript
const matches = Array.from(markdown.matchAll(/```json\s*([\s\S]*?)```/g));
if (matches.length === 0) return null;
const match = matches[matches.length - 1];
```

Remove the `if (!match) return null;` line below since the early return is now in the array check.

The complete updated function becomes:

```typescript
export function parseStructuredTail(markdown: string): StructuredTail | null {
  const matches = Array.from(markdown.matchAll(/```json\s*([\s\S]*?)```/g));
  if (matches.length === 0) return null;
  const match = matches[matches.length - 1];

  let raw: unknown;
  try { raw = JSON.parse(match[1]); } catch { return null; }
  if (!raw || typeof raw !== 'object') return null;

  const r = raw as Record<string, unknown>;
  const dayShape = r.day_shape;
  const pattern = r.dominant_fragmentation_pattern;
  const tomorrow = r.tomorrow_first_90;

  if (typeof dayShape !== 'string' || !(DAY_SHAPES as readonly string[]).includes(dayShape)) return null;
  if (typeof pattern !== 'string' || !(FRAGMENTATION_PATTERNS as readonly string[]).includes(pattern)) return null;
  if (!tomorrow || typeof tomorrow !== 'object') return null;

  const t = tomorrow as Record<string, unknown>;
  if (typeof t.start_local !== 'string' || !/^\d{2}:\d{2}$/.test(t.start_local)) return null;
  if (typeof t.target !== 'string' || t.target.length === 0) return null;
  if (t.supporting_event_id !== null && typeof t.supporting_event_id !== 'string') return null;
  if (t.competing_event_id !== null && typeof t.competing_event_id !== 'string') return null;

  return {
    dayShape: dayShape as StructuredTail['dayShape'],
    dominantFragmentationPattern: pattern as StructuredTail['dominantFragmentationPattern'],
    tomorrowFirst90: {
      startLocal: t.start_local,
      target: t.target,
      supportingEventId: t.supporting_event_id as string | null,
      competingEventId: t.competing_event_id as string | null,
    },
  };
}
```

- [ ] **Step 5: Run all parse-tail tests**

```bash
npx vitest run tests/brief/parse-tail.test.ts
```

Expected: ALL pass including the new one.

- [ ] **Step 6: Commit**

```bash
git add src/main/brief/parse-tail.ts tests/brief/parse-tail.test.ts
git commit -m "fix(brief): parseStructuredTail picks the LAST json block (defense vs prompt drift)"
```

---

## Task D.11 — assembleBriefPayload uses injected `now` consistently

**Files:**
- Modify: `src/main/brief/assemble-payload.ts`
- Modify: `tests/brief/assemble-payload.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/brief/assemble-payload.test.ts`:

```typescript
it('goalProgressMsThisWeek uses injected now, not real wall-clock Date.now()', () => {
  // Create a session that was 6 days ago
  const fixedNow = new Date('2026-06-01T12:00:00.000Z');
  const sixDaysAgo = fixedNow.getTime() - 6 * 24 * 3_600_000;
  const id = sessions.open({
    startTime: sixDaysAgo,
    appName: 'a', windowTitle: 't', displayId: 0,
    projectLabel: 'Oracle', confidence: 1,
  });
  sessions.close(id, sixDaysAgo + 30 * MIN);

  // With fixedNow, the session is 6 days ago — within the 7-day window
  const payloadWithin = assembleBriefPayload(db, fixedNow, {
    workHours: { enabled: false, start: '09:00', end: '17:00', weekendsActive: false },
    goal: { text: 'Goal', projectLabel: 'Oracle', setAt: Date.now() },
  });
  expect(payloadWithin.goalProgressMsThisWeek).toBe(30 * MIN);

  // With a now 8 days later, the session is 14 days ago — outside the window
  const futureNow = new Date(fixedNow.getTime() + 8 * 24 * 3_600_000);
  const payloadOutside = assembleBriefPayload(db, futureNow, {
    workHours: { enabled: false, start: '09:00', end: '17:00', weekendsActive: false },
    goal: { text: 'Goal', projectLabel: 'Oracle', setAt: Date.now() },
  });
  expect(payloadOutside.goalProgressMsThisWeek).toBe(0);
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run tests/brief/assemble-payload.test.ts
```

Expected: the new test FAILS because the current code uses `Date.now()` instead of `now.getTime()` — if the real `Date.now()` happens to be close enough to `fixedNow`, the test may flake. It will fail deterministically when `futureNow` is used.

- [ ] **Step 3: Fix assemble-payload.ts**

In `src/main/brief/assemble-payload.ts`, find line 91:

```typescript
const weekStartMs = Date.now() - SEVEN_DAYS_MS;
```

Replace with:

```typescript
const weekStartMs = now.getTime() - SEVEN_DAYS_MS;
```

- [ ] **Step 4: Run all assemble-payload tests**

```bash
npx vitest run tests/brief/assemble-payload.test.ts
```

Expected: ALL pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/brief/assemble-payload.ts tests/brief/assemble-payload.test.ts
git commit -m "fix(brief): assembleBriefPayload uses injected now for determinism"
```

---

## Task D.12 — Remove dead `bumpGenerationCount`

**Files:**
- Modify: `src/main/brief/repo.ts`

- [ ] **Step 1: Delete the method**

In `src/main/brief/repo.ts`, remove lines 48–50:

```typescript
bumpGenerationCount(date: string): void {
  this.db.prepare('UPDATE daily_briefs SET generation_count = generation_count + 1 WHERE date = ?').run(date);
}
```

- [ ] **Step 2: Verify nothing imports or calls it**

```bash
npx vitest run -- --reporter=verbose 2>&1 | head -5
```

Or search with grep:

```bash
# In PowerShell:
Select-String -Path "src/**/*.ts","tests/**/*.ts" -Pattern "bumpGenerationCount" -Recurse
```

Expected: 0 matches.

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/brief/
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/brief/repo.ts
git commit -m "refactor(brief): remove unused bumpGenerationCount"
```

---

## Final Verification

- [ ] **Run full typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Run all tests**

```bash
npm test
```

The `npm test` script runs `npm run rebuild:node` first, then vitest. Expected: all tests pass (prior tests + 3 new test files added in D.5, D.6, D.9).

- [ ] **Run build**

```bash
npm run build
```

Expected: 0 errors, output in `out/`.

---

## Self-Review

### Spec coverage check

| Item | Covered by |
|------|-----------|
| D.1 (concurrent guard) | Pre-existing in ipc.ts — skipped per instructions |
| D.2 (prior assistant turn on regen) | Task D.2 |
| D.3 (streaming abort, no flicker) | Task D.3 |
| D.4 (safeStorage marker) | Batch A.9 — skipped per instructions |
| D.5 (no gen_count bump on failure) | Task D.5 (applied in D.2 rewrite, tested in D.5) |
| D.6 (accumulate tokens) | Task D.6 (applied in D.2 rewrite, tested in D.6) |
| D.7 (retry on tail null) | Applied in D.2 rewrite (tail null → continue in loop) |
| D.8 (wall-clock cap + BRIEF_CANCEL) | Task D.8 (cap applied in D.2, BRIEF_CANCEL stub added) |
| D.9 (API key scrubbing) | Task D.9 |
| D.10 (last json block) | Task D.10 |
| D.11 (consistent now) | Task D.11 |
| D.12 (remove bumpGenerationCount) | Task D.12 |

### Ordering dependency note

Tasks MUST be executed in this order:
1. ABI sanity check
2. D.2 (rewrites generate.ts — everything else builds on this shape)
3. D.3 (patches generate.ts further for streaming abort)
4. D.5 (writes test against D.2's fallback behavior — no code change)
5. D.6 (writes test against D.2's accumulation — no code change)
6. D.8 (adds BRIEF_CANCEL stub to ipc.ts + preload)
7. D.9, D.10, D.11, D.12 (independent of each other, any order)

### BRIEF_CANCEL deferral note

Full `AbortController` wiring (pass signal into streaming call, cancel in-flight HTTP) is marked deferred to v0.3.2. The current D.8 implementation delivers the wall-clock cap (the blocking fix) and a no-op IPC stub that won't break callers. The backlog item exists in the audit plan.
