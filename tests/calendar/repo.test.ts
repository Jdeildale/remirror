import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@main/db/migrate';
import { CalendarRepo } from '@main/calendar/repo';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../../src/main/db/migrations');

let db: Database.Database;
let repo: CalendarRepo;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, migrationsDir);
  repo = new CalendarRepo(db);
});

afterEach(() => db.close());

describe('CalendarRepo', () => {
  it('upserts an event and reads it back', () => {
    repo.upsert({
      id: 'g1',
      date: '2026-05-25',
      startTimeMs: 1000,
      endTimeMs: 2000,
      title: 'Standup',
      description: '',
      attendeesCount: 5,
      isAllDay: false,
      declined: false,
      rawJson: '{}',
    });
    const events = repo.findByDate('2026-05-25');
    expect(events.length).toBe(1);
    expect(events[0].title).toBe('Standup');
  });

  it('replaces a stored event on upsert (no duplicates)', () => {
    repo.upsert({ id: 'g1', date: '2026-05-25', startTimeMs: 1000, endTimeMs: 2000, title: 'Old', description: '', attendeesCount: 0, isAllDay: false, declined: false, rawJson: '{}' });
    repo.upsert({ id: 'g1', date: '2026-05-25', startTimeMs: 1000, endTimeMs: 2000, title: 'New', description: '', attendeesCount: 0, isAllDay: false, declined: false, rawJson: '{}' });
    const events = repo.findByDate('2026-05-25');
    expect(events.length).toBe(1);
    expect(events[0].title).toBe('New');
  });

  it('findByDate returns events ordered by start_time', () => {
    repo.upsert({ id: 'b', date: '2026-05-25', startTimeMs: 2000, endTimeMs: 3000, title: 'Second', description: '', attendeesCount: 0, isAllDay: false, declined: false, rawJson: '{}' });
    repo.upsert({ id: 'a', date: '2026-05-25', startTimeMs: 1000, endTimeMs: 2000, title: 'First', description: '', attendeesCount: 0, isAllDay: false, declined: false, rawJson: '{}' });
    const events = repo.findByDate('2026-05-25');
    expect(events.map(e => e.title)).toEqual(['First', 'Second']);
  });

  it('deleteByDate removes all events for that date', () => {
    repo.upsert({ id: 'a', date: '2026-05-25', startTimeMs: 1000, endTimeMs: 2000, title: 'X', description: '', attendeesCount: 0, isAllDay: false, declined: false, rawJson: '{}' });
    repo.upsert({ id: 'b', date: '2026-05-26', startTimeMs: 1000, endTimeMs: 2000, title: 'Y', description: '', attendeesCount: 0, isAllDay: false, declined: false, rawJson: '{}' });
    repo.deleteByDate('2026-05-25');
    expect(repo.findByDate('2026-05-25').length).toBe(0);
    expect(repo.findByDate('2026-05-26').length).toBe(1);
  });

  it('setProjectLabel updates the mapping', () => {
    repo.upsert({ id: 'a', date: '2026-05-25', startTimeMs: 1000, endTimeMs: 2000, title: 'Jackie call', description: '', attendeesCount: 0, isAllDay: false, declined: false, rawJson: '{}' });
    repo.setProjectLabel('a', "Jackie's Website");
    const events = repo.findByDate('2026-05-25');
    expect(events[0].projectLabel).toBe("Jackie's Website");
  });
});
