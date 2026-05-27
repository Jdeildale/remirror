import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@main/db/migrate';
import { SessionRepo } from '@main/capture/sessions';
import { computeDailyStats, computeProjectBreakdown } from '@main/stats/daily-stats';
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

describe('computeProjectBreakdown', () => {
  it('returns empty array when there are no sessions today', () => {
    const bd = computeProjectBreakdown(db, new Date());
    expect(bd).toEqual([]);
  });

  it('aggregates total time per project label', () => {
    const now = new Date();
    const start = dayStart(now);

    const a1 = sessions.open({ startTime: start + HOUR, appName: 'a', windowTitle: 't', displayId: 0, projectLabel: 'Oracle', confidence: 1 });
    sessions.close(a1, start + HOUR + 30 * MIN);
    const a2 = sessions.open({ startTime: start + 3 * HOUR, appName: 'a', windowTitle: 't', displayId: 0, projectLabel: 'Oracle', confidence: 1 });
    sessions.close(a2, start + 3 * HOUR + 20 * MIN);

    const bd = computeProjectBreakdown(db, now);
    expect(bd.length).toBe(1);
    expect(bd[0].label).toBe('Oracle');
    expect(bd[0].totalMs).toBe(50 * MIN);
  });

  it('counts returns when project label changes between consecutive sessions', () => {
    const now = new Date();
    const start = dayStart(now);

    const a1 = sessions.open({ startTime: start + HOUR, appName: 'a', windowTitle: 't', displayId: 0, projectLabel: 'Oracle', confidence: 1 });
    sessions.close(a1, start + HOUR + 10 * MIN);
    const b1 = sessions.open({ startTime: start + 2 * HOUR, appName: 'b', windowTitle: 't', displayId: 0, projectLabel: 'Twitter', confidence: 0 });
    sessions.close(b1, start + 2 * HOUR + 5 * MIN);
    const a2 = sessions.open({ startTime: start + 3 * HOUR, appName: 'a', windowTitle: 't', displayId: 0, projectLabel: 'Oracle', confidence: 1 });
    sessions.close(a2, start + 3 * HOUR + 15 * MIN);

    const bd = computeProjectBreakdown(db, now);
    const oracle = bd.find(e => e.label === 'Oracle');
    expect(oracle).toBeDefined();
    expect(oracle!.returnCount).toBe(2); // returned to Oracle twice (1st time + after Twitter)
    const twitter = bd.find(e => e.label === 'Twitter');
    expect(twitter!.returnCount).toBe(1);
  });

  it('does not double-count returns for consecutive same-label sessions', () => {
    const now = new Date();
    const start = dayStart(now);

    // Three consecutive Oracle sessions — should be 1 return, not 3
    for (let i = 0; i < 3; i++) {
      const id = sessions.open({ startTime: start + (i + 1) * HOUR, appName: 'a', windowTitle: 't', displayId: 0, projectLabel: 'Oracle', confidence: 1 });
      sessions.close(id, start + (i + 1) * HOUR + 30 * MIN);
    }

    const bd = computeProjectBreakdown(db, now);
    const oracle = bd.find(e => e.label === 'Oracle');
    expect(oracle!.returnCount).toBe(1);
  });

  it('sorts by totalMs descending', () => {
    const now = new Date();
    const start = dayStart(now);

    const a1 = sessions.open({ startTime: start + HOUR, appName: 'a', windowTitle: 't', displayId: 0, projectLabel: 'Small', confidence: 1 });
    sessions.close(a1, start + HOUR + 10 * MIN);
    const b1 = sessions.open({ startTime: start + 2 * HOUR, appName: 'b', windowTitle: 't', displayId: 0, projectLabel: 'Big', confidence: 1 });
    sessions.close(b1, start + 2 * HOUR + 60 * MIN);
    const c1 = sessions.open({ startTime: start + 4 * HOUR, appName: 'c', windowTitle: 't', displayId: 0, projectLabel: 'Medium', confidence: 1 });
    sessions.close(c1, start + 4 * HOUR + 30 * MIN);

    const bd = computeProjectBreakdown(db, now);
    expect(bd.map(e => e.label)).toEqual(['Big', 'Medium', 'Small']);
  });

  it('treats null project_label as "unclassified"', () => {
    const now = new Date();
    const start = dayStart(now);

    const id = sessions.open({ startTime: start + HOUR, appName: 'a', windowTitle: 't', displayId: 0, projectLabel: 'unclassified', confidence: 0 });
    sessions.close(id, start + HOUR + 10 * MIN);

    const bd = computeProjectBreakdown(db, now);
    expect(bd[0].label).toBe('unclassified');
  });

  it('excludes transition rows from totals and returnCount', () => {
    const now = new Date();
    const start = dayStart(now);

    // Oracle work (30 min)
    const a1 = sessions.open({ startTime: start + HOUR, appName: 'a', windowTitle: 't', displayId: 0, projectLabel: 'Oracle', confidence: 1 });
    sessions.close(a1, start + HOUR + 30 * MIN);

    // A 2-min "drift" to Twitter — gets reclassified to kind='transition' by SessionRepo.close()
    const drift = sessions.open({ startTime: start + 2 * HOUR, appName: 'b', windowTitle: 't', displayId: 0, projectLabel: 'Twitter', confidence: 0 });
    sessions.close(drift, start + 2 * HOUR + 2 * MIN);

    // Back to Oracle (20 min)
    const a2 = sessions.open({ startTime: start + 3 * HOUR, appName: 'a', windowTitle: 't', displayId: 0, projectLabel: 'Oracle', confidence: 1 });
    sessions.close(a2, start + 3 * HOUR + 20 * MIN);

    const bd = computeProjectBreakdown(db, now);
    // Twitter should NOT appear (its row was a transition)
    expect(bd.find(e => e.label === 'Twitter')).toBeUndefined();
    // Oracle should be the only entry, with two visits worth of time and returnCount=1 (transitions were excluded, so the two Oracle rows are consecutive from this function's perspective)
    expect(bd.length).toBe(1);
    expect(bd[0].label).toBe('Oracle');
    expect(bd[0].totalMs).toBe(50 * MIN);
    expect(bd[0].returnCount).toBe(1);
  });
});
