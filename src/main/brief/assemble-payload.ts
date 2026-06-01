import type Database from 'better-sqlite3';
import { computeDailyStats, computeProjectBreakdown } from '../stats/daily-stats';
import { CalendarRepo } from '../calendar/repo';
import { computeAdherence } from '../calendar/adherence';
import type { DailyStatsDTO, WeeklyGoalDTO } from '@shared/types';

const SEVEN_DAYS_MS = 7 * 24 * 3_600_000;
const FOCUS_BLOCK_MS = 20 * 60_000;

interface AssembleInput {
  workHours: { enabled: boolean; start: string; end: string; weekendsActive: boolean };
  goal: WeeklyGoalDTO | null;
}

export interface BriefInputPayload {
  date: string;
  workHours: AssembleInput['workHours'];
  stats: DailyStatsDTO;
  projectBreakdown: Array<{ label: string; totalMs: number; returnCount: number }>;
  calendarEvents: Array<{
    id: string;
    title: string;
    startTimeMs: number;
    endTimeMs: number;
    projectLabel: string | null;
    status: 'kept' | 'partial' | 'did-not-start';
    overlapMs: number;
  }>;
  goal: WeeklyGoalDTO | null;
  goalProgressMsThisWeek: number;
  focusBlocksDetailed: Array<{ projectLabel: string; durationMs: number; startTime: number }>;
  longestBlock: DailyStatsDTO['longestBlock'];
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function assembleBriefPayload(db: Database.Database, now: Date, input: AssembleInput): BriefInputPayload {
  const date = isoDate(now);
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const dayStartMs = dayStart.getTime();
  const dayEndMs = dayStartMs + 24 * 3_600_000 - 1;

  const stats = computeDailyStats(db, now);
  const projectBreakdown = computeProjectBreakdown(db, now).slice(0, 5);

  // Sessions for adherence computation
  const sessionsToday = db.prepare(`
    SELECT id, start_time, end_time, paused_ms, project_label, kind
    FROM sessions
    WHERE start_time >= ? AND start_time <= ? AND end_time IS NOT NULL
  `).all(dayStartMs, dayEndMs) as Array<{
    id: string; start_time: number; end_time: number; paused_ms: number; project_label: string | null; kind: string;
  }>;

  // Calendar events with adherence per event
  const calRepo = new CalendarRepo(db);
  const calEvents = calRepo.findByDate(date).map(e => {
    const adherence = computeAdherence({
      event: { startMs: e.startTimeMs, endMs: e.endTimeMs, projectLabel: e.projectLabel },
      sessions: sessionsToday.map(s => ({ startMs: s.start_time, endMs: s.end_time, projectLabel: s.project_label ?? 'unclassified' })),
    });
    return {
      id: e.id,
      title: e.title,
      startTimeMs: e.startTimeMs,
      endTimeMs: e.endTimeMs,
      projectLabel: e.projectLabel,
      status: adherence.status,
      overlapMs: adherence.overlapMs,
    };
  });

  // Focus blocks ≥ 20m (effective duration), kind='work'
  const focusBlocksDetailed = sessionsToday
    .filter(s => s.kind === 'work')
    .map(s => {
      const effective = Math.max(0, s.end_time - s.start_time - s.paused_ms);
      return { sessionId: s.id, projectLabel: s.project_label ?? 'unclassified', durationMs: effective, startTime: s.start_time };
    })
    .filter(b => b.durationMs >= FOCUS_BLOCK_MS)
    .map(({ sessionId: _id, ...rest }) => rest);

  // Goal progress this week: sum effective work-kind sessions matching goal.projectLabel over last 7 days
  let goalProgressMsThisWeek = 0;
  if (input.goal && input.goal.projectLabel) {
    const weekStartMs = Date.now() - SEVEN_DAYS_MS;
    const rows = db.prepare(`
      SELECT start_time, end_time, paused_ms
      FROM sessions
      WHERE end_time IS NOT NULL AND kind = 'work' AND project_label = ? AND start_time >= ?
    `).all(input.goal.projectLabel, weekStartMs) as Array<{ start_time: number; end_time: number; paused_ms: number }>;
    goalProgressMsThisWeek = rows.reduce((acc, r) => acc + Math.max(0, r.end_time - r.start_time - r.paused_ms), 0);
  }

  return {
    date,
    workHours: input.workHours,
    stats,
    projectBreakdown,
    calendarEvents: calEvents,
    goal: input.goal,
    goalProgressMsThisWeek,
    focusBlocksDetailed,
    longestBlock: stats.longestBlock,
  };
}
