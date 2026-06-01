import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@main/db/migrate';
import { BriefRepo } from '@main/brief/repo';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../../src/main/db/migrations');

let db: Database.Database;
let repo: BriefRepo;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, migrationsDir);
  repo = new BriefRepo(db);
});

afterEach(() => db.close());

function sampleBrief(date: string, overrides: Partial<{ generationCount: number; headline: string }> = {}) {
  return {
    date,
    generatedAt: 1748390123000,
    generationCount: overrides.generationCount ?? 1,
    model: 'claude-sonnet-4-5',
    promptVersion: 'v1.0',
    inputTokens: 4231,
    outputTokens: 412,
    headline: overrides.headline ?? 'sample headline',
    story: 'sample story',
    whatHeld: 'sample held',
    whatFragmented: 'sample fragmented',
    tomorrowFirst90: 'sample tomorrow',
    rawMarkdown: '## headline\n...',
    structuredTail: null,
  };
}

describe('BriefRepo', () => {
  it('inserts a brief and reads it back by date', () => {
    repo.upsert(sampleBrief('2026-05-27'));
    const got = repo.findByDate('2026-05-27');
    expect(got).not.toBeNull();
    expect(got!.headline).toBe('sample headline');
    expect(got!.generationCount).toBe(1);
  });

  it('returns null for a date with no brief', () => {
    expect(repo.findByDate('2026-05-27')).toBeNull();
  });

  it('upsert replaces an existing brief on the same date and bumps generation_count', () => {
    repo.upsert(sampleBrief('2026-05-27', { headline: 'first' }));
    repo.upsert(sampleBrief('2026-05-27', { headline: 'second', generationCount: 2 }));
    const got = repo.findByDate('2026-05-27');
    expect(got!.headline).toBe('second');
    expect(got!.generationCount).toBe(2);
  });

  it('listPast returns briefs newest-first', () => {
    repo.upsert(sampleBrief('2026-05-25'));
    repo.upsert(sampleBrief('2026-05-27'));
    repo.upsert(sampleBrief('2026-05-26'));
    const list = repo.listPast(10);
    expect(list.map(b => b.date)).toEqual(['2026-05-27', '2026-05-26', '2026-05-25']);
  });

  it('listPast respects the limit', () => {
    for (let i = 1; i <= 5; i++) {
      repo.upsert(sampleBrief(`2026-05-2${i}`));
    }
    expect(repo.listPast(2).length).toBe(2);
  });

  it('round-trips a parsed structured tail when present', () => {
    repo.upsert({
      ...sampleBrief('2026-05-27'),
      structuredTail: { dayShape: 'diffuse', dominantFragmentationPattern: 'morning_drift', tomorrowFirst90: { startLocal: '09:00', target: 'Oracle', supportingEventId: null, competingEventId: null } },
    });
    const got = repo.findByDate('2026-05-27');
    expect(got!.structuredTail).toEqual({
      dayShape: 'diffuse',
      dominantFragmentationPattern: 'morning_drift',
      tomorrowFirst90: { startLocal: '09:00', target: 'Oracle', supportingEventId: null, competingEventId: null },
    });
  });
});
