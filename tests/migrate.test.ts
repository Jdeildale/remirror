import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@main/db/migrate';
import path from 'path';
import fs from 'fs';
import os from 'os';

let tmpDir: string;
let migrationsDir: string;
let db: Database.Database;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remirror-migrate-'));
  migrationsDir = path.join(tmpDir, 'migrations');
  fs.mkdirSync(migrationsDir);
  db = new Database(':memory:');
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('runMigrations', () => {
  it('creates _migrations table if missing', () => {
    runMigrations(db, migrationsDir);
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'"
    ).get();
    expect(row).toEqual({ name: '_migrations' });
  });

  it('applies a single migration file', () => {
    fs.writeFileSync(
      path.join(migrationsDir, '001_test.sql'),
      'CREATE TABLE foo (id TEXT PRIMARY KEY);'
    );
    runMigrations(db, migrationsDir);
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='foo'"
    ).get();
    expect(row).toEqual({ name: 'foo' });
    const tracked = db.prepare(
      "SELECT filename FROM _migrations WHERE filename='001_test.sql'"
    ).get();
    expect(tracked).toEqual({ filename: '001_test.sql' });
  });

  it('does not re-apply a migration on second run', () => {
    fs.writeFileSync(
      path.join(migrationsDir, '001_test.sql'),
      'CREATE TABLE foo (id TEXT PRIMARY KEY);'
    );
    runMigrations(db, migrationsDir);
    // Second run should be a no-op (would otherwise throw "table foo already exists")
    expect(() => runMigrations(db, migrationsDir)).not.toThrow();
  });

  it('applies migrations in alphanumeric order', () => {
    fs.writeFileSync(
      path.join(migrationsDir, '002_second.sql'),
      'INSERT INTO ordering (n) VALUES (2);'
    );
    fs.writeFileSync(
      path.join(migrationsDir, '001_first.sql'),
      'CREATE TABLE ordering (n INTEGER); INSERT INTO ordering (n) VALUES (1);'
    );
    runMigrations(db, migrationsDir);
    const rows = db.prepare('SELECT n FROM ordering ORDER BY n').all();
    expect(rows).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it('runs each migration inside a transaction', () => {
    fs.writeFileSync(
      path.join(migrationsDir, '001_bad.sql'),
      'CREATE TABLE good (id TEXT); INSERT INTO nonexistent VALUES (1);'
    );
    expect(() => runMigrations(db, migrationsDir)).toThrow();
    // The 'good' table from the first statement should be rolled back.
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='good'"
    ).get();
    expect(row).toBeUndefined();
  });

  it('rejects a migration containing a top-level BEGIN statement', () => {
    fs.writeFileSync(
      path.join(migrationsDir, '001_nested_txn.sql'),
      'BEGIN;\nCREATE TABLE foo (id TEXT);\nCOMMIT;'
    );
    expect(() => runMigrations(db, migrationsDir)).toThrow(
      /must not contain BEGIN\/COMMIT\/ROLLBACK/
    );
  });

  it('rejects a migration containing a top-level ROLLBACK statement', () => {
    fs.writeFileSync(
      path.join(migrationsDir, '001_rollback.sql'),
      'ROLLBACK;'
    );
    expect(() => runMigrations(db, migrationsDir)).toThrow(
      /must not contain BEGIN\/COMMIT\/ROLLBACK/
    );
  });

  it('allows BEGIN inside a CREATE TRIGGER body', () => {
    fs.writeFileSync(
      path.join(migrationsDir, '001_trigger.sql'),
      `CREATE TABLE t (id TEXT);
CREATE TRIGGER t_after_insert AFTER INSERT ON t BEGIN
  SELECT 1;
END;`
    );
    // Should NOT throw — BEGIN here is inside a trigger, not a top-level transaction
    expect(() => runMigrations(db, migrationsDir)).not.toThrow();
  });
});
