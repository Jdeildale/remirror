import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@main/db/migrate';
import { SessionRepo } from '@main/capture/sessions';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../src/main/db/migrations');

let db: Database.Database;
let repo: SessionRepo;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, migrationsDir);
  repo = new SessionRepo(db);
});

afterEach(() => db.close());

describe('SessionRepo', () => {
  it('opens a new session and returns the id', () => {
    const id = repo.open({
      startTime: 1000,
      appName: 'code.exe',
      windowTitle: 'main.ts',
      displayId: 1,
      projectLabel: 'Project A',
      confidence: 1.0,
    });
    const row = db.prepare('SELECT * FROM sessions WHERE id=?').get(id) as any;
    expect(row.app_name).toBe('code.exe');
    expect(row.start_time).toBe(1000);
    expect(row.end_time).toBeNull();
    expect(row.kind).toBe('work');
  });

  it('closes a session by setting end_time', () => {
    const id = repo.open({ startTime: 1000, appName: 'x', windowTitle: 'y', displayId: 0, projectLabel: 'unclassified', confidence: 0 });
    repo.close(id, 5000);
    const row = db.prepare('SELECT end_time FROM sessions WHERE id=?').get(id) as any;
    expect(row.end_time).toBe(5000);
  });

  it('marks session as "transition" when duration < 4 minutes', () => {
    const id = repo.open({ startTime: 0, appName: 'x', windowTitle: 'y', displayId: 0, projectLabel: 'unclassified', confidence: 0 });
    repo.close(id, 60_000); // 1 minute
    const row = db.prepare('SELECT kind FROM sessions WHERE id=?').get(id) as any;
    expect(row.kind).toBe('transition');
  });

  it('keeps kind=work when duration >= 4 minutes', () => {
    const id = repo.open({ startTime: 0, appName: 'x', windowTitle: 'y', displayId: 0, projectLabel: 'unclassified', confidence: 0 });
    repo.close(id, 5 * 60_000);
    const row = db.prepare('SELECT kind FROM sessions WHERE id=?').get(id) as any;
    expect(row.kind).toBe('work');
  });

  it('heartbeat updates end_time on an open session', () => {
    const id = repo.open({ startTime: 1000, appName: 'x', windowTitle: 'y', displayId: 0, projectLabel: 'unclassified', confidence: 0 });
    repo.heartbeat(id, 9000);
    const row = db.prepare('SELECT end_time FROM sessions WHERE id=?').get(id) as any;
    expect(row.end_time).toBe(9000);
  });

  it('adds to paused_ms', () => {
    const id = repo.open({ startTime: 0, appName: 'x', windowTitle: 'y', displayId: 0, projectLabel: 'unclassified', confidence: 0 });
    repo.addPausedMs(id, 30_000);
    repo.addPausedMs(id, 15_000);
    const row = db.prepare('SELECT paused_ms FROM sessions WHERE id=?').get(id) as any;
    expect(row.paused_ms).toBe(45_000);
  });

  it('reclassify changes project_label and confidence', () => {
    const id = repo.open({ startTime: 0, appName: 'x', windowTitle: 'y', displayId: 0, projectLabel: 'unclassified', confidence: 0 });
    repo.reclassify(id, 'Project B');
    const row = db.prepare('SELECT project_label, confidence FROM sessions WHERE id=?').get(id) as any;
    expect(row.project_label).toBe('Project B');
    expect(row.confidence).toBe(1.0);
  });

  it('recentSessions returns the last N ordered by start_time desc', () => {
    repo.open({ startTime: 1000, appName: 'a', windowTitle: 't', displayId: 0, projectLabel: 'P', confidence: 1 });
    repo.open({ startTime: 2000, appName: 'b', windowTitle: 't', displayId: 0, projectLabel: 'P', confidence: 1 });
    repo.open({ startTime: 3000, appName: 'c', windowTitle: 't', displayId: 0, projectLabel: 'P', confidence: 1 });
    const rows = repo.recentSessions(2);
    expect(rows.map(r => r.app_name)).toEqual(['c', 'b']);
  });
});
