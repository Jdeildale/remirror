import type Database from 'better-sqlite3';

export interface CalendarEventRow {
  id: string;
  date: string;
  startTimeMs: number;
  endTimeMs: number;
  title: string;
  description: string;
  attendeesCount: number;
  isAllDay: boolean;
  declined: boolean;
  projectLabel: string | null;
  rawJson: string;
  fetchedAt: number;
}

export interface CalendarEventInput {
  id: string;
  date: string;
  startTimeMs: number;
  endTimeMs: number;
  title: string;
  description: string;
  attendeesCount: number;
  isAllDay: boolean;
  declined: boolean;
  rawJson: string;
}

export class CalendarRepo {
  constructor(private db: Database.Database) {}

  /**
   * Insert or update a calendar event row.
   *
   * **Sticky project_label:** The `project_label` column is intentionally
   * omitted from the ON CONFLICT SET clause. When the user manually maps an
   * event to a project via the UI, that mapping survives re-fetches from
   * Google Calendar — even if the event title changes slightly. This is the
   * desired "sticky" UX: user intent is preserved across syncs.
   *
   * If a future version wants to clear the label when the event title changes
   * significantly (e.g., Levenshtein distance > 20%), that logic belongs here,
   * comparing `excluded.title` to the existing row's `title` before deciding
   * whether to reset `project_label`.
   */
  upsert(e: CalendarEventInput): void {
    this.db.prepare(`
      INSERT INTO calendar_events (id, date, start_time, end_time, title, description, attendees_count, is_all_day, declined, source, raw_json, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'google', ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        date=excluded.date,
        start_time=excluded.start_time,
        end_time=excluded.end_time,
        title=excluded.title,
        description=excluded.description,
        attendees_count=excluded.attendees_count,
        is_all_day=excluded.is_all_day,
        declined=excluded.declined,
        raw_json=excluded.raw_json,
        fetched_at=excluded.fetched_at
    `).run(
      e.id, e.date, e.startTimeMs, e.endTimeMs, e.title, e.description,
      e.attendeesCount, e.isAllDay ? 1 : 0, e.declined ? 1 : 0, e.rawJson, Date.now(),
    );
  }

  findByDate(date: string): CalendarEventRow[] {
    const rows = this.db.prepare(`
      SELECT * FROM calendar_events WHERE date = ? ORDER BY start_time ASC
    `).all(date) as Array<any>;
    return rows.map(r => ({
      id: r.id,
      date: r.date,
      startTimeMs: r.start_time,
      endTimeMs: r.end_time,
      title: r.title,
      description: r.description ?? '',
      attendeesCount: r.attendees_count,
      isAllDay: r.is_all_day === 1,
      declined: r.declined === 1,
      projectLabel: r.project_label,
      rawJson: r.raw_json ?? '',
      fetchedAt: r.fetched_at,
    }));
  }

  deleteByDate(date: string): void {
    this.db.prepare('DELETE FROM calendar_events WHERE date = ?').run(date);
  }

  setProjectLabel(eventId: string, label: string | null): void {
    this.db.prepare('UPDATE calendar_events SET project_label = ? WHERE id = ?').run(label, eventId);
  }
}
