import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDatabase, closeDatabase, getDatabase } from '@main/db/index';
import path from 'path';
import fs from 'fs';
import os from 'os';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remirror-db-'));
});

afterEach(() => {
  closeDatabase();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('openDatabase', () => {
  it('creates the database file and applies PRAGMAs', () => {
    const db = openDatabase(path.join(tmpDir, 'test.db'));
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('runs the init migration and creates sessions table', () => {
    const db = openDatabase(path.join(tmpDir, 'test.db'));
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'"
    ).get();
    expect(row).toEqual({ name: 'sessions' });
  });

  it('closes any orphan sessions (NULL end_time) on startup', () => {
    const dbPath = path.join(tmpDir, 'test.db');
    let db = openDatabase(dbPath);
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    db.prepare(
      "INSERT INTO sessions (id, start_time, end_time) VALUES (?, ?, NULL)"
    ).run('orphan-1', oneHourAgo);
    closeDatabase();

    db = openDatabase(dbPath);
    const orphan = db.prepare("SELECT end_time FROM sessions WHERE id='orphan-1'").get() as { end_time: number };
    expect(orphan.end_time).not.toBeNull();
    // Capped at start + 5min
    expect(orphan.end_time).toBe(oneHourAgo + 5 * 60 * 1000);
  });
});

describe('seed exclusions migration', () => {
  it('seeds default exclusions on first run', () => {
    const db = openDatabase(path.join(tmpDir, 'test.db'));
    const count = (db.prepare('SELECT COUNT(*) as c FROM exclusions').get() as { c: number }).c;
    expect(count).toBeGreaterThanOrEqual(16);
  });

  it('does not duplicate exclusions on second open', () => {
    const dbPath = path.join(tmpDir, 'test.db');
    openDatabase(dbPath);
    const firstCount = (getDatabase().prepare('SELECT COUNT(*) as c FROM exclusions').get() as { c: number }).c;
    closeDatabase();

    openDatabase(dbPath);
    const secondCount = (getDatabase().prepare('SELECT COUNT(*) as c FROM exclusions').get() as { c: number }).c;
    expect(secondCount).toBe(firstCount);
  });
});
