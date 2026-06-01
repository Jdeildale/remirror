import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@main/db/migrate';
import { SessionRepo } from '@main/capture/sessions';
import { assembleBriefPayload } from '@main/brief/assemble-payload';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../../src/main/db/migrations');

let db: Database.Database;
let sessions: SessionRepo;

const MIN = 60_000;
const HOUR = 60 * MIN;

function dayStart(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, migrationsDir);
  sessions = new SessionRepo(db);
});

afterEach(() => db.close());

describe('assembleBriefPayload', () => {
  it('produces a payload with date, stats, breakdown for empty day', () => {
    const now = new Date();
    const payload = assembleBriefPayload(db, now, {
      workHours: { enabled: true, start: '09:00', end: '17:00', weekendsActive: false },
      goal: null,
    });
    expect(payload.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(payload.stats.focusBlocksCount).toBe(0);
    expect(payload.projectBreakdown).toEqual([]);
    expect(payload.calendarEvents).toEqual([]);
    expect(payload.goal).toBeNull();
    expect(payload.focusBlocksDetailed).toEqual([]);
  });

  it('includes focus blocks ≥ 20m with start time + project label', () => {
    const now = new Date();
    const start = dayStart(now);
    const id = sessions.open({ startTime: start + HOUR, appName: 'a', windowTitle: 't', displayId: 0, projectLabel: 'Oracle', confidence: 1 });
    sessions.close(id, start + HOUR + 25 * MIN);

    const payload = assembleBriefPayload(db, now, {
      workHours: { enabled: true, start: '09:00', end: '17:00', weekendsActive: false },
      goal: null,
    });
    expect(payload.focusBlocksDetailed.length).toBe(1);
    expect(payload.focusBlocksDetailed[0].projectLabel).toBe('Oracle');
    expect(payload.focusBlocksDetailed[0].durationMs).toBe(25 * MIN);
    expect(payload.focusBlocksDetailed[0].startTime).toBe(start + HOUR);
  });

  it('limits projectBreakdown to top 5 by totalMs', () => {
    const now = new Date();
    const start = dayStart(now);
    const labels = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    labels.forEach((label, i) => {
      const id = sessions.open({ startTime: start + (i + 1) * HOUR, appName: 'x', windowTitle: 't', displayId: 0, projectLabel: label, confidence: 1 });
      sessions.close(id, start + (i + 1) * HOUR + (7 - i) * 10 * MIN); // A=70m, B=60m, …, G=10m
    });
    const payload = assembleBriefPayload(db, now, {
      workHours: { enabled: true, start: '09:00', end: '17:00', weekendsActive: false },
      goal: null,
    });
    expect(payload.projectBreakdown.length).toBe(5);
    expect(payload.projectBreakdown[0].label).toBe('A');
    expect(payload.projectBreakdown.at(-1)!.label).toBe('E');
  });

  it('passes through goal and computes goalProgressMsThisWeek', () => {
    const now = new Date();
    const start = dayStart(now);
    const id = sessions.open({ startTime: start + HOUR, appName: 'a', windowTitle: 't', displayId: 0, projectLabel: 'Oracle', confidence: 1 });
    sessions.close(id, start + HOUR + 25 * MIN);

    const payload = assembleBriefPayload(db, now, {
      workHours: { enabled: true, start: '09:00', end: '17:00', weekendsActive: false },
      goal: { text: 'Ship the Oracle dashboard', projectLabel: 'Oracle', setAt: Date.now() },
    });
    expect(payload.goal).not.toBeNull();
    expect(payload.goal!.text).toBe('Ship the Oracle dashboard');
    expect(payload.goalProgressMsThisWeek).toBe(25 * MIN);
  });

  it('passes calendar events with adherence status into payload', () => {
    // Insert a calendar event manually
    db.prepare(`
      INSERT INTO calendar_events (id, date, start_time, end_time, title, description, attendees_count, is_all_day, declined, project_label, source, raw_json, fetched_at)
      VALUES (?, ?, ?, ?, ?, '', 0, 0, 0, ?, 'google', '{}', ?)
    `).run('e1', dateLocal(new Date()), Date.now() - 3 * HOUR, Date.now() - 2 * HOUR, 'Standup', 'Oracle', Date.now());

    const payload = assembleBriefPayload(db, new Date(), {
      workHours: { enabled: true, start: '09:00', end: '17:00', weekendsActive: false },
      goal: null,
    });
    expect(payload.calendarEvents.length).toBe(1);
    expect(payload.calendarEvents[0].title).toBe('Standup');
    expect(payload.calendarEvents[0].projectLabel).toBe('Oracle');
    expect(['kept', 'partial', 'did-not-start']).toContain(payload.calendarEvents[0].status);
  });
});

function dateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
