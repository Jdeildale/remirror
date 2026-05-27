import { ipcMain, BrowserWindow } from 'electron';
import { IPC, type TodayStats, type WorkHoursConfigDTO } from '@shared/ipc-contract';
import type { CaptureEngine } from './capture/engine';
import { getDatabase } from './db/index';
import { SessionRepo } from './capture/sessions';
import { ulid } from './ulid';
import { store } from './store';
import type { Project, Exclusion } from '@shared/types';
import { dailyStatsCache } from './stats/cache';
import { computeProjectBreakdown } from './stats/daily-stats';
import { CalendarRepo } from './calendar/repo';
import { computeAdherence } from './calendar/adherence';
import { startOAuthFlow, disconnectGoogle, hasStoredAuth } from './google/auth';
import type {
  CalendarEventDTO,
  DailyStatsDTO,
  ProjectBreakdownDTO,
  WeeklyGoalDTO,
  GoogleStatusDTO,
} from '@shared/types';

function isoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function registerIpc(engine: CaptureEngine): void {
  const db = getDatabase();
  const repo = new SessionRepo(db);

  // Engine
  ipcMain.handle(IPC.ENGINE_STATUS_GET, () => engine.getStatus());
  ipcMain.handle(IPC.ENGINE_PAUSE, () => engine.pause());
  ipcMain.handle(IPC.ENGINE_RESUME, () => engine.resume());

  engine.on('status', (status) => broadcast(IPC.ENGINE_STATUS_CHANGED, status));
  engine.on('change', () => broadcast(IPC.SESSIONS_CHANGED));

  // Sessions
  ipcMain.handle(IPC.SESSIONS_RECENT, (_e, limit: number) => repo.recentSessions(limit));
  ipcMain.handle(IPC.SESSIONS_TODAY_STATS, (): TodayStats => repo.todayStats(Date.now()));
  ipcMain.handle(IPC.SESSIONS_RECLASSIFY, (_e, id: string, label: string) => {
    repo.reclassify(id, label);
    broadcast(IPC.SESSIONS_CHANGED);
  });

  // Projects
  ipcMain.handle(IPC.PROJECTS_LIST, (): Project[] => {
    return (db.prepare('SELECT * FROM projects ORDER BY display_order, id').all() as Array<any>)
      .map(r => ({ ...r, keywords: JSON.parse(r.keywords ?? '[]') }));
  });
  ipcMain.handle(IPC.PROJECTS_UPSERT, (_e, p: Project) => {
    const id = p.id ?? ulid();
    const keywords = JSON.stringify(p.keywords ?? []);
    db.prepare(`
      INSERT INTO projects (id, label, category, keywords, goal_id, display_order)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        label=excluded.label, category=excluded.category, keywords=excluded.keywords,
        goal_id=excluded.goal_id, display_order=excluded.display_order
    `).run(id, p.label, p.category, keywords, p.goal_id, p.display_order ?? 0);
    engine.reloadProjects();
    broadcast(IPC.PROJECTS_CHANGED);
    return { ...p, id, keywords: p.keywords ?? [] };
  });
  ipcMain.handle(IPC.PROJECTS_DELETE, (_e, id: string) => {
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    engine.reloadProjects();
    broadcast(IPC.PROJECTS_CHANGED);
  });

  // Exclusions
  ipcMain.handle(IPC.EXCLUSIONS_LIST, (): Exclusion[] => {
    return db.prepare('SELECT * FROM exclusions ORDER BY id').all() as Exclusion[];
  });
  ipcMain.handle(IPC.EXCLUSIONS_UPSERT, (_e, ex: Exclusion) => {
    const id = ex.id ?? ulid();
    db.prepare(`
      INSERT INTO exclusions (id, app_name, window_title_contains, reason)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        app_name=excluded.app_name,
        window_title_contains=excluded.window_title_contains,
        reason=excluded.reason
    `).run(id, ex.app_name, ex.window_title_contains, ex.reason);
    engine.reloadExclusions();
    return { ...ex, id };
  });
  ipcMain.handle(IPC.EXCLUSIONS_DELETE, (_e, id: string) => {
    db.prepare('DELETE FROM exclusions WHERE id = ?').run(id);
    engine.reloadExclusions();
  });

  // Onboarding
  ipcMain.handle(IPC.ONBOARDING_NEEDED, (): boolean => {
    return (db.prepare('SELECT COUNT(*) as c FROM projects').get() as { c: number }).c === 0;
  });
  ipcMain.handle(IPC.ONBOARDING_COMPLETE, () => {
    engine.start();
  });

  // Work hours — pure metadata for the daily brief (Phase 4). NOT a recording
  // gate. The engine never reads this; the brief reads it to bucket sessions
  // into before/during/after work.
  ipcMain.handle(IPC.WORK_HOURS_GET, (): WorkHoursConfigDTO => {
    return store.get('workHours');
  });
  ipcMain.handle(IPC.WORK_HOURS_SET, (_e, cfg: WorkHoursConfigDTO) => {
    store.set('workHours', cfg);
  });

  const calRepo = new CalendarRepo(db);

  // Stats
  ipcMain.handle(IPC.STATS_TODAY, (): DailyStatsDTO => dailyStatsCache.get());
  ipcMain.handle(IPC.STATS_PROJECT_BREAKDOWN, (): ProjectBreakdownDTO[] => {
    return computeProjectBreakdown(db, new Date());
  });

  // Calendar
  ipcMain.handle(IPC.CALENDAR_LIST_TODAY, (): CalendarEventDTO[] => {
    const today = isoDateLocal(new Date());
    const events = calRepo.findByDate(today);
    const sessionsToday = repo.recentSessions(500).filter(s => {
      const sDate = new Date(s.start_time);
      return isoDateLocal(sDate) === today && s.end_time !== null;
    });
    return events.map(e => {
      const adherence = computeAdherence({
        event: { startMs: e.startTimeMs, endMs: e.endTimeMs, projectLabel: e.projectLabel },
        sessions: sessionsToday.map(s => ({
          startMs: s.start_time,
          endMs: s.end_time as number,
          projectLabel: s.project_label ?? 'unclassified',
        })),
      });
      return {
        id: e.id,
        startTimeMs: e.startTimeMs,
        endTimeMs: e.endTimeMs,
        title: e.title,
        projectLabel: e.projectLabel,
        status: adherence.status,
        overlapMs: adherence.overlapMs,
      };
    });
  });

  ipcMain.handle(IPC.CALENDAR_REFRESH, async (): Promise<boolean> => {
    const sync = global.__remirrorCalendarSync;
    if (!sync) return false;
    return await sync.syncNow();
  });

  ipcMain.handle(IPC.CALENDAR_STATUS, () => {
    return global.__remirrorCalendarSync?.getStatus() ?? { lastSyncAt: null, lastError: null, running: false };
  });

  // Google OAuth
  ipcMain.handle(IPC.GOOGLE_CONNECT, async (): Promise<GoogleStatusDTO> => {
    try {
      await startOAuthFlow();
      global.__remirrorCalendarSync?.start();
      const status: GoogleStatusDTO = {
        connected: true,
        syncedAt: store.get('google').syncedAt ?? null,
        lastError: null,
      };
      broadcast(IPC.GOOGLE_STATUS_CHANGED, status);
      return status;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status: GoogleStatusDTO = { connected: false, syncedAt: null, lastError: msg };
      broadcast(IPC.GOOGLE_STATUS_CHANGED, status);
      return status;
    }
  });

  ipcMain.handle(IPC.GOOGLE_DISCONNECT, () => {
    disconnectGoogle();
    global.__remirrorCalendarSync?.stop();
    broadcast(IPC.GOOGLE_STATUS_CHANGED, { connected: false, syncedAt: null, lastError: null });
  });

  ipcMain.handle(IPC.GOOGLE_STATUS, (): GoogleStatusDTO => ({
    connected: hasStoredAuth(),
    syncedAt: store.get('google').syncedAt ?? null,
    lastError: global.__remirrorCalendarSync?.getStatus().lastError ?? null,
  }));

  // Goal
  ipcMain.handle(IPC.GOAL_GET, (): WeeklyGoalDTO | null => {
    return store.get('weeklyGoal') ?? null;
  });

  ipcMain.handle(IPC.GOAL_SET, (_e, g: { text: string; projectLabel?: string } | null): WeeklyGoalDTO | null => {
    if (g === null) {
      store.delete('weeklyGoal');
      return null;
    }
    const stored: WeeklyGoalDTO = { text: g.text, projectLabel: g.projectLabel, setAt: Date.now() };
    store.set('weeklyGoal', stored);
    return stored;
  });
}

function broadcast(channel: string, ...args: unknown[]): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send(channel, ...args);
  }
}
