import type Database from 'better-sqlite3';
import { ulid } from '../ulid';
import type { Session, SessionKind } from '@shared/types';

const TRANSITION_THRESHOLD_MS = 4 * 60 * 1000;

export interface OpenSessionInput {
  startTime: number;
  appName: string | null;
  windowTitle: string | null;
  displayId: number | null;
  projectLabel: string;
  confidence: number;
  kind?: SessionKind;
}

export class SessionRepo {
  constructor(private db: Database.Database) {}

  open(input: OpenSessionInput): string {
    const id = ulid();
    this.db.prepare(`
      INSERT INTO sessions (id, start_time, end_time, app_name, window_title, display_id, project_label, confidence, kind, paused_ms, last_heartbeat)
      VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(
      id, input.startTime, input.appName, input.windowTitle, input.displayId,
      input.projectLabel, input.confidence, input.kind ?? 'work', input.startTime,
    );
    return id;
  }

  close(id: string, endTime: number): void {
    this.db.transaction(() => {
      const row = this.db.prepare('SELECT start_time, kind, paused_ms FROM sessions WHERE id=?').get(id) as { start_time: number; kind: SessionKind; paused_ms: number } | undefined;
      if (!row) return;
      const effectiveDuration = endTime - row.start_time - row.paused_ms;
      const newKind: SessionKind = row.kind === 'work' && effectiveDuration < TRANSITION_THRESHOLD_MS ? 'transition' : row.kind;
      this.db.prepare('UPDATE sessions SET end_time = ?, kind = ?, last_heartbeat = ? WHERE id = ?').run(endTime, newKind, endTime, id);
    })();
  }

  heartbeat(id: string, now: number): void {
    this.db.prepare('UPDATE sessions SET end_time = ?, last_heartbeat = ? WHERE id = ?').run(now, now, id);
  }

  addPausedMs(id: string, ms: number): void {
    this.db.prepare('UPDATE sessions SET paused_ms = paused_ms + ? WHERE id = ?').run(ms, id);
  }

  reclassify(id: string, newLabel: string): void {
    this.db.prepare('UPDATE sessions SET project_label = ?, confidence = 1.0 WHERE id = ?').run(newLabel, id);
  }

  recentSessions(limit: number): Session[] {
    return this.db.prepare(
      'SELECT * FROM sessions ORDER BY start_time DESC LIMIT ?'
    ).all(limit) as Session[];
  }

  todayStats(now: number): { totalSessions: number; topProjects: Array<{ label: string; totalMs: number }>; longestBlockMs: number } {
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const startMs = startOfDay.getTime();

    const sessions = this.db.prepare(
      'SELECT app_name, project_label, start_time, end_time, paused_ms FROM sessions WHERE start_time >= ? AND end_time IS NOT NULL'
    ).all(startMs) as Array<{ app_name: string; project_label: string; start_time: number; end_time: number; paused_ms: number }>;

    const byProject = new Map<string, number>();
    let longestBlockMs = 0;
    for (const s of sessions) {
      const dur = Math.max(0, s.end_time - s.start_time - s.paused_ms);
      byProject.set(s.project_label, (byProject.get(s.project_label) ?? 0) + dur);
      if (dur > longestBlockMs) longestBlockMs = dur;
    }
    const topProjects = [...byProject.entries()]
      .map(([label, totalMs]) => ({ label, totalMs }))
      .sort((a, b) => b.totalMs - a.totalMs)
      .slice(0, 3);
    return { totalSessions: sessions.length, topProjects, longestBlockMs };
  }
}
