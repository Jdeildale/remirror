/**
 * Tests for generate.ts orchestrator — D.5 (no gen_count bump on failure) and
 * D.6 (token accumulation across attempts).
 *
 * We mock the Anthropic streaming module and the heavy Electron/DB deps so these
 * tests run in pure Node without a real API key or database.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Module mocks (hoisted — must appear before any imports from these modules) ──

// Mock the Anthropic streaming module. Tests override this per-case via vi.mocked.
vi.mock('@main/anthropic/stream', () => ({
  streamBriefGeneration: vi.fn(),
}));

// Mock the store (electron-store)
vi.mock('@main/store', () => ({
  store: {
    get: vi.fn().mockReturnValue({ enabled: false, start: '09:00', end: '17:00', weekendsActive: false }),
  },
}));

// Mock the DB connection — return a minimal object; BriefRepo will be mocked separately
vi.mock('@main/db/index', () => ({
  getDatabase: vi.fn().mockReturnValue({}),
}));

// Mock assembleBriefPayload to return a minimal payload JSON
vi.mock('@main/brief/assemble-payload', () => ({
  assembleBriefPayload: vi.fn().mockReturnValue({ date: '2026-06-01', workHours: {} }),
}));

// Mock BriefRepo
const mockUpsert = vi.fn();
const mockFindByDate = vi.fn().mockReturnValue(null);
vi.mock('@main/brief/repo', () => ({
  BriefRepo: vi.fn().mockImplementation(() => ({
    upsert: mockUpsert,
    findByDate: mockFindByDate,
  })),
}));

// Electron's webContents/BrowserWindow (already mocked at process level via setup.ts,
// but we need BrowserWindow.getAllWindows + webContents.fromId for sendToOrigin)
vi.mock('electron', async (importOriginal) => {
  const original = await importOriginal<typeof import('electron')>();
  return {
    ...original,
    BrowserWindow: { getAllWindows: vi.fn().mockReturnValue([]) },
    webContents: { fromId: vi.fn().mockReturnValue(null) },
  };
});

// ── Actual import (after mocks are registered) ──
import { generateBrief } from '@main/brief/generate';
import { streamBriefGeneration } from '@main/anthropic/stream';

// ── Helpers ──

/** A valid brief markdown that passes gate, parse, and tail checks. */
const VALID_BRIEF_MD = `## Truth headline
You put in 4 hours on Oracle today.

## Today's story
You kept returning to the dashboard work. Three sessions totalling 4h 10m, with the longest at 2h 15m.

## What held
The morning block from 09:00 to 11:15 was the anchor. You came back after the standup and finished a second run.

## What fragmented
The afternoon split across three short context switches at 14:00, 14:30, and 15:00 — calendar collision pattern.

## Tomorrow's first 90
09:00 — Oracle dashboard. Your 10:30 stand-up supports this; no competing events before then.

\`\`\`json
{
  "day_shape": "anchored",
  "dominant_fragmentation_pattern": "calendar_collision",
  "tomorrow_first_90": {
    "start_local": "09:00",
    "target": "Oracle dashboard",
    "supporting_event_id": null,
    "competing_event_id": null
  }
}
\`\`\``;

/** A brief that always fails the banned-vocab gate. */
const BANNED_BRIEF_MD = 'You really should have done better. You missed your targets and wasted the afternoon.';

// ── Tests ──

describe('generateBrief — D.5 no gen_count bump on exhausted failure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindByDate.mockReturnValue(null);
    mockUpsert.mockReset();
  });

  it('does NOT call repo.upsert when all auto-regen attempts return banned vocab', async () => {
    // Every stream attempt returns banned vocab (always fails gate)
    vi.mocked(streamBriefGeneration).mockResolvedValue({
      rawMarkdown: BANNED_BRIEF_MD,
      inputTokens: 100,
      outputTokens: 50,
      model: 'claude-sonnet-4-5',
      promptVersion: 'v1.0',
    });

    await generateBrief('gen-test-1', 999);

    // upsert must not have been called — user retains their regen budget
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('DOES call repo.upsert when the stream produces a valid brief', async () => {
    vi.mocked(streamBriefGeneration).mockResolvedValue({
      rawMarkdown: VALID_BRIEF_MD,
      inputTokens: 200,
      outputTokens: 150,
      model: 'claude-sonnet-4-5',
      promptVersion: 'v1.0',
    });

    await generateBrief('gen-test-2', 999);

    expect(mockUpsert).toHaveBeenCalledOnce();
    const stored = mockUpsert.mock.calls[0][0];
    expect(stored.generationCount).toBe(1); // 0 existing + 1
  });
});

describe('generateBrief — D.6 accumulate token counts across attempts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindByDate.mockReturnValue(null);
    mockUpsert.mockReset();
  });

  it('stores sum of tokens across all attempts when first two fail', async () => {
    let callCount = 0;
    vi.mocked(streamBriefGeneration).mockImplementation(async () => {
      callCount += 1;
      if (callCount < 3) {
        return {
          rawMarkdown: BANNED_BRIEF_MD,
          inputTokens: 100,
          outputTokens: 50,
          model: 'claude-sonnet-4-5',
          promptVersion: 'v1.0',
        };
      }
      return {
        rawMarkdown: VALID_BRIEF_MD,
        inputTokens: 200,
        outputTokens: 150,
        model: 'claude-sonnet-4-5',
        promptVersion: 'v1.0',
      };
    });

    await generateBrief('gen-token', 999);

    expect(mockUpsert).toHaveBeenCalledOnce();
    const stored = mockUpsert.mock.calls[0][0];
    // 2 failed (100*2 in, 50*2 out) + 1 success (200 in, 150 out) = 400 in, 250 out
    expect(stored.inputTokens).toBe(400);
    expect(stored.outputTokens).toBe(250);
  });
});
