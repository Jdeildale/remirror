import type Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export function runMigrations(db: Database.Database, migrationsDir: string): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const applied = new Set(
    db.prepare('SELECT filename FROM _migrations').all().map(
      (r: any) => r.filename as string
    )
  );

  if (!fs.existsSync(migrationsDir)) return;

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const filename of files) {
    if (applied.has(filename)) continue;
    const filepath = path.join(migrationsDir, filename);
    const sql = fs.readFileSync(filepath, 'utf-8');
    // Reject migrations that contain explicit top-level transaction control statements.
    // The runner wraps each migration in a transaction already; nested BEGIN/COMMIT
    // would cause SQLite errors. Note: BEGIN inside CREATE TRIGGER is fine — we only
    // reject BEGIN/COMMIT/ROLLBACK followed by whitespace, semicolon, or end-of-string.
    if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*(TRANSACTION\s*)?(;|$)/im.test(sql)) {
      throw new Error(
        `Migration ${filename} must not contain BEGIN/COMMIT/ROLLBACK — the runner wraps each migration in a transaction`
      );
    }
    const apply = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO _migrations (filename, applied_at) VALUES (?, ?)')
        .run(filename, Date.now());
    });
    apply();
  }
}
