import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { runMigrations } from './migrate';
import log from '../log';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db: Database.Database | null = null;

export function openDatabase(dbPath: string): Database.Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');

  const migrationsDir = path.join(__dirname, 'migrations');
  runMigrations(db, migrationsDir);

  recoverOrphanSessions(db);

  log.info(`DB opened at ${dbPath}`);
  return db;
}

export function getDatabase(): Database.Database {
  if (!db) throw new Error('Database not opened');
  return db;
}

export function closeDatabase(): void {
  if (!db) return;
  try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch (err) { log.warn('WAL checkpoint failed:', err); }
  try { db.close(); } catch (err) { log.warn('DB close failed:', err); }
  db = null;
}

function recoverOrphanSessions(db: Database.Database): void {
  const result = db.prepare(`
    UPDATE sessions
    SET end_time = COALESCE(last_heartbeat, start_time)
    WHERE end_time IS NULL
  `).run();
  if (result.changes > 0) {
    log.warn(`Recovered ${result.changes} orphan session(s) on startup`);
  }
}
