import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@main/db/migrate';
import { SessionRepo } from '@main/capture/sessions';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../../src/main/db/migrations');

let db: Database.Database;
let repo: SessionRepo;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, migrationsDir);
  repo = new SessionRepo(db);
});

afterEach(() => db.close());

function recoverOrphans(db: Database.Database): number {
  const result = db.prepare(`
    UPDATE sessions
    SET end_time = COALESCE(last_heartbeat, start_time)
    WHERE end_time IS NULL
  `).run();
  return result.changes;
}

describe('orphan recovery', () => {
  it('recovers orphan with heartbeat: end_time = last_heartbeat (start+10min)', () => {
    const startTime = 1_000_000;
    const heartbeatTime = startTime + 10 * 60_000; // start + 10 min

    // Open a session (sets last_heartbeat = startTime)
    const id = repo.open({
      startTime,
      appName: 'code.exe',
      windowTitle: 'orphan test',
      displayId: 1,
      projectLabel: 'TestProject',
      confidence: 1.0,
    });

    // Simulate a heartbeat at start+10min
    repo.heartbeat(id, heartbeatTime);

    // Verify end_time is not null (heartbeat sets it) — manually clear it to simulate crash
    db.prepare('UPDATE sessions SET end_time = NULL WHERE id = ?').run(id);

    // Confirm the session is now orphaned but has a last_heartbeat
    const before = db.prepare('SELECT end_time, last_heartbeat FROM sessions WHERE id=?').get(id) as any;
    expect(before.end_time).toBeNull();
    expect(before.last_heartbeat).toBe(heartbeatTime);

    // Run recovery
    const changes = recoverOrphans(db);
    expect(changes).toBe(1);

    const after = db.prepare('SELECT end_time FROM sessions WHERE id=?').get(id) as any;
    expect(after.end_time).toBe(heartbeatTime);
  });

  it('recovers orphan with no heartbeat (defensive null): end_time = start_time', () => {
    const startTime = 2_000_000;

    const id = repo.open({
      startTime,
      appName: 'app.exe',
      windowTitle: 'no heartbeat',
      displayId: 0,
      projectLabel: 'unclassified',
      confidence: 0,
    });

    // Force last_heartbeat to NULL to simulate the defensive path
    db.prepare('UPDATE sessions SET end_time = NULL, last_heartbeat = NULL WHERE id = ?').run(id);

    const before = db.prepare('SELECT end_time, last_heartbeat FROM sessions WHERE id=?').get(id) as any;
    expect(before.end_time).toBeNull();
    expect(before.last_heartbeat).toBeNull();

    const changes = recoverOrphans(db);
    expect(changes).toBe(1);

    const after = db.prepare('SELECT end_time FROM sessions WHERE id=?').get(id) as any;
    expect(after.end_time).toBe(startTime);
  });

  it('recovers multiple orphans independently', () => {
    const t1 = 3_000_000;
    const t2 = 4_000_000;
    const hb2 = t2 + 5 * 60_000;

    // Session 1: heartbeat at t1 (no subsequent heartbeat beyond open)
    const id1 = repo.open({ startTime: t1, appName: 'a', windowTitle: 'w', displayId: 0, projectLabel: 'P', confidence: 1 });
    // Session 2: heartbeat at hb2
    const id2 = repo.open({ startTime: t2, appName: 'b', windowTitle: 'w', displayId: 0, projectLabel: 'P', confidence: 1 });
    repo.heartbeat(id2, hb2);

    // Simulate crash: clear end_times
    db.prepare('UPDATE sessions SET end_time = NULL WHERE id IN (?, ?)').run(id1, id2);

    const changes = recoverOrphans(db);
    expect(changes).toBe(2);

    const row1 = db.prepare('SELECT end_time FROM sessions WHERE id=?').get(id1) as any;
    const row2 = db.prepare('SELECT end_time FROM sessions WHERE id=?').get(id2) as any;

    // Session 1 had last_heartbeat = t1 (set by open)
    expect(row1.end_time).toBe(t1);
    // Session 2 had last_heartbeat = hb2 (set by heartbeat call)
    expect(row2.end_time).toBe(hb2);
  });
});
