import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@main/db/migrate';
import { SessionRepo } from '@main/capture/sessions';
import { computeDailyStats } from '@main/stats/daily-stats';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../../src/main/db/migrations');

let db: Database.Database;
let sessions: SessionRepo;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, migrationsDir);
  sessions = new SessionRepo(db);
});

afterEach(() => db.close());

const MIN = 60_000;
const HOUR = 60 * MIN;

function dayStart(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

describe('computeDailyStats', () => {
  it('returns zero stats when there are no sessions today', () => {
    const stats = computeDailyStats(db, new Date());
    expect(stats.focusBlocksCount).toBe(0);
    expect(stats.switchesCount).toBe(0);
    expect(stats.focusedMs).toBe(0);
    expect(stats.elsewhereMs).toBe(0);
    expect(stats.longestBlock).toBeNull();
  });

  it('counts focus blocks ≥20 minutes by effective duration', () => {
    const now = new Date();
    const start = dayStart(now);

    const id1 = sessions.open({ startTime: start + HOUR, appName: 'a', windowTitle: 't', displayId: 0, projectLabel: 'Oracle', confidence: 1 });
    sessions.close(id1, start + HOUR + 21 * MIN); // 21m → focus block

    const id2 = sessions.open({ startTime: start + 3 * HOUR, appName: 'b', windowTitle: 't', displayId: 0, projectLabel: 'Oracle', confidence: 1 });
    sessions.close(id2, start + 3 * HOUR + 5 * MIN); // 5m → not a focus block (becomes transition)

    const stats = computeDailyStats(db, now);
    expect(stats.focusBlocksCount).toBe(1);
  });

  it('sums focused vs elsewhere by project label', () => {
    const now = new Date();
    const start = dayStart(now);

    const id1 = sessions.open({ startTime: start + HOUR, appName: 'a', windowTitle: 't', displayId: 0, projectLabel: 'Oracle', confidence: 1 });
    sessions.close(id1, start + HOUR + 60 * MIN); // 60m focused

    const id2 = sessions.open({ startTime: start + 3 * HOUR, appName: 'b', windowTitle: 't', displayId: 0, projectLabel: 'unclassified', confidence: 0 });
    sessions.close(id2, start + 3 * HOUR + 30 * MIN); // 30m elsewhere

    const stats = computeDailyStats(db, now);
    expect(stats.focusedMs).toBe(60 * MIN);
    expect(stats.elsewhereMs).toBe(30 * MIN);
  });

  it('switches counter = count of closed sessions today', () => {
    const now = new Date();
    const start = dayStart(now);

    for (let i = 0; i < 4; i++) {
      const id = sessions.open({ startTime: start + (i + 1) * HOUR, appName: `a${i}`, windowTitle: 't', displayId: 0, projectLabel: 'Oracle', confidence: 1 });
      sessions.close(id, start + (i + 1) * HOUR + 5 * MIN);
    }
    const stats = computeDailyStats(db, now);
    expect(stats.switchesCount).toBe(4);
  });

  it('returns the longest block by effective duration', () => {
    const now = new Date();
    const start = dayStart(now);

    const id1 = sessions.open({ startTime: start + HOUR, appName: 'a', windowTitle: 't', displayId: 0, projectLabel: 'Oracle', confidence: 1 });
    sessions.close(id1, start + HOUR + 20 * MIN);

    const id2 = sessions.open({ startTime: start + 3 * HOUR, appName: 'b', windowTitle: 't', displayId: 0, projectLabel: 'Oracle', confidence: 1 });
    sessions.close(id2, start + 3 * HOUR + 47 * MIN);

    const id3 = sessions.open({ startTime: start + 5 * HOUR, appName: 'c', windowTitle: 't', displayId: 0, projectLabel: 'Oracle', confidence: 1 });
    sessions.close(id3, start + 5 * HOUR + 30 * MIN);

    const stats = computeDailyStats(db, now);
    expect(stats.longestBlock).not.toBeNull();
    expect(stats.longestBlock!.durationMs).toBe(47 * MIN);
    expect(stats.longestBlock!.id).toBe(id2);
  });

  it('subtracts paused_ms from effective duration', () => {
    const now = new Date();
    const start = dayStart(now);

    const id = sessions.open({ startTime: start + HOUR, appName: 'a', windowTitle: 't', displayId: 0, projectLabel: 'Oracle', confidence: 1 });
    sessions.addPausedMs(id, 15 * MIN); // 15m paused
    sessions.close(id, start + HOUR + 30 * MIN); // 30m wall-clock, 15m effective

    const stats = computeDailyStats(db, now);
    expect(stats.focusedMs).toBe(15 * MIN);
    expect(stats.focusBlocksCount).toBe(0); // 15min effective < 20min threshold
  });

  it('counts transition (sub-4-min) sessions toward switchesCount but ignores them for longestBlock', () => {
    const now = new Date();
    const start = dayStart(now);

    // 2-min session → gets reclassified to kind='transition' by SessionRepo.close()
    const idShort = sessions.open({ startTime: start + HOUR, appName: 'a', windowTitle: 't', displayId: 0, projectLabel: 'Oracle', confidence: 1 });
    sessions.close(idShort, start + HOUR + 2 * MIN);

    // 25-min session → stays kind='work' and becomes the longest
    const idWork = sessions.open({ startTime: start + 3 * HOUR, appName: 'b', windowTitle: 't', displayId: 0, projectLabel: 'Oracle', confidence: 1 });
    sessions.close(idWork, start + 3 * HOUR + 25 * MIN);

    const stats = computeDailyStats(db, now);
    expect(stats.switchesCount).toBe(2);             // both rows counted as switches
    expect(stats.longestBlock).not.toBeNull();
    expect(stats.longestBlock!.id).toBe(idWork);     // 25-min work wins, not 2-min transition
    expect(stats.longestBlock!.durationMs).toBe(25 * MIN);
  });
});
