import { ipcMain, BrowserWindow } from 'electron';
import log from './log';
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
  DailyBriefDTO,
  RegenStatusDTO,
  AnthropicStatusDTO,
} from '@shared/types';
import { BriefRepo } from './brief/repo';
import { generateBrief } from './brief/generate';
import { regenStatus } from './brief/regen-policy';
import { hasAnthropicKey, writeAnthropicKey, clearAnthropicKey } from './anthropic/key';
import { testConnection } from './anthropic/client';
import { MODEL_IDS } from './anthropic/models';

// ── IPC input validation helpers ─────────────────────────────────────────────
function assertString(value: unknown, name: string, maxLen = 10_000): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`IPC validation: ${name} must be a non-empty string`);
  }
  if (value.length > maxLen) {
    throw new Error(`IPC validation: ${name} exceeds max length (${maxLen})`);
  }
  return value;
}

function assertBool(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`IPC validation: ${name} must be a boolean`);
  }
  return value;
}

function assertHHMM(value: unknown, name: string): string {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) {
    throw new Error(`IPC validation: ${name} must match HH:MM`);
  }
  return value;
}

function isoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function registerIpc(engine: CaptureEngine): void {
  // A.11: Hot-reload safety — remove any handlers registered by a previous call.
  for (const channel of Object.values(IPC)) {
    ipcMain.removeHandler(channel);
  }

  const db = getDatabase();
  const repo = new SessionRepo(db);

  // Engine
  ipcMain.handle(IPC.ENGINE_STATUS_GET, () => engine.getStatus());
  ipcMain.handle(IPC.ENGINE_PAUSE, () => engine.pause());
  ipcMain.handle(IPC.ENGINE_RESUME, () => engine.resume());

  engine.on('status', (status) => broadcast(IPC.ENGINE_STATUS_CHANGED, status));
  engine.on('change', () => broadcast(IPC.SESSIONS_CHANGED));

  // Sessions
  ipcMain.handle(IPC.SESSIONS_RECENT, (_e, limit: unknown) => {
    const safeLimit = Math.min(Math.max(1, Math.floor(Number(limit) || 20)), 1000);
    return repo.recentSessions(safeLimit);
  });
  ipcMain.handle(IPC.SESSIONS_TODAY_STATS, (): TodayStats => repo.todayStats(Date.now()));
  ipcMain.handle(IPC.SESSIONS_RECLASSIFY, (_e, id: unknown, label: unknown) => {
    const safeId = assertString(id, 'id');
    const safeLabel = assertString(label, 'label');
    repo.reclassify(safeId, safeLabel);
    broadcast(IPC.SESSIONS_CHANGED);
  });

  // Projects
  ipcMain.handle(IPC.PROJECTS_LIST, (): Project[] => {
    return (db.prepare('SELECT * FROM projects ORDER BY display_order, id').all() as Array<any>)
      .map(r => ({ ...r, keywords: JSON.parse(r.keywords ?? '[]') }));
  });
  ipcMain.handle(IPC.PROJECTS_UPSERT, (_e, p: unknown) => {
    if (!p || typeof p !== 'object') throw new Error('IPC validation: project must be an object');
    const proj = p as Record<string, unknown>;
    const label = assertString(proj['label'], 'label', 500);
    if (proj['keywords'] !== undefined && !Array.isArray(proj['keywords'])) {
      throw new Error('IPC validation: keywords must be an array');
    }
    if (Array.isArray(proj['keywords'])) {
      for (const kw of proj['keywords'] as unknown[]) {
        if (typeof kw !== 'string') throw new Error('IPC validation: each keyword must be a string');
      }
    }
    const safeP = p as Project;
    const id = safeP.id ?? ulid();
    const keywords = JSON.stringify(safeP.keywords ?? []);
    db.prepare(`
      INSERT INTO projects (id, label, category, keywords, goal_id, display_order)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        label=excluded.label, category=excluded.category, keywords=excluded.keywords,
        goal_id=excluded.goal_id, display_order=excluded.display_order
    `).run(id, label, safeP.category, keywords, safeP.goal_id, safeP.display_order ?? 0);
    engine.reloadProjects();
    broadcast(IPC.PROJECTS_CHANGED);
    return { ...safeP, id, keywords: safeP.keywords ?? [] };
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
  ipcMain.handle(IPC.EXCLUSIONS_UPSERT, (_e, ex: unknown) => {
    if (!ex || typeof ex !== 'object') throw new Error('IPC validation: exclusion must be an object');
    const excl = ex as Record<string, unknown>;
    // At least one of app_name or window_title_contains must be a non-empty string
    if (excl['app_name'] !== undefined && excl['app_name'] !== null) {
      assertString(excl['app_name'], 'app_name', 500);
    }
    if (excl['window_title_contains'] !== undefined && excl['window_title_contains'] !== null) {
      assertString(excl['window_title_contains'], 'window_title_contains', 500);
    }
    const safeEx = ex as Exclusion;
    const id = safeEx.id ?? ulid();
    db.prepare(`
      INSERT INTO exclusions (id, app_name, window_title_contains, reason)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        app_name=excluded.app_name,
        window_title_contains=excluded.window_title_contains,
        reason=excluded.reason
    `).run(id, safeEx.app_name, safeEx.window_title_contains, safeEx.reason);
    engine.reloadExclusions();
    return { ...safeEx, id };
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
  ipcMain.handle(IPC.WORK_HOURS_SET, (_e, cfg: unknown) => {
    if (!cfg || typeof cfg !== 'object') throw new Error('IPC validation: work hours config must be an object');
    const c = cfg as Record<string, unknown>;
    assertBool(c['enabled'], 'enabled');
    assertHHMM(c['start'], 'start');
    assertHHMM(c['end'], 'end');
    assertBool(c['weekendsActive'], 'weekendsActive');
    store.set('workHours', cfg as WorkHoursConfigDTO);
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

  ipcMain.handle(IPC.GOAL_SET, (_e, g: unknown): WeeklyGoalDTO | null => {
    if (g === null || g === undefined) {
      store.delete('weeklyGoal');
      return null;
    }
    if (typeof g !== 'object') throw new Error('IPC validation: goal must be null or an object');
    const goal = g as Record<string, unknown>;
    const text = assertString(goal['text'], 'text', 500);
    if (goal['projectLabel'] !== undefined && goal['projectLabel'] !== null) {
      assertString(goal['projectLabel'], 'projectLabel', 500);
    }
    const stored: WeeklyGoalDTO = {
      text,
      projectLabel: typeof goal['projectLabel'] === 'string' ? goal['projectLabel'] : undefined,
      setAt: Date.now(),
    };
    store.set('weeklyGoal', stored);
    return stored;
  });

  // Brief + Anthropic
  const briefRepo = new BriefRepo(db);

  ipcMain.handle(IPC.BRIEF_TODAY, (): DailyBriefDTO | null => {
    const today = isoDateLocal(new Date());
    return briefRepo.findByDate(today);
  });

  ipcMain.handle(IPC.BRIEF_LIST_PAST, (_e, limit: unknown = 30): DailyBriefDTO[] => {
    const safeLimit = Math.min(Math.max(1, Math.floor(Number(limit) || 30)), 365);
    return briefRepo.listPast(safeLimit);
  });

  // In-flight guard: maps date → generationId for deduplicated concurrent requests
  const inFlightByDate = new Map<string, string>();

  ipcMain.handle(IPC.BRIEF_GENERATE, (e): { generationId: string } => {
    const today = isoDateLocal(new Date());
    // Return existing stream if one is already in progress for today
    if (inFlightByDate.has(today)) {
      return { generationId: inFlightByDate.get(today)! };
    }
    // Server-side regen cap check
    const regen = regenStatus(briefRepo.findByDate(today)?.generationCount ?? 0);
    if (regen.locked) throw new Error('Regeneration limit reached for today');

    const generationId = ulid();
    const originSenderId = e.sender.id;
    inFlightByDate.set(today, generationId);
    // Fire-and-forget: streams progress via targeted sendToOrigin
    generateBrief(generationId, originSenderId)
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        broadcast(IPC.BRIEF_STREAM, { kind: 'error', generationId, message, retryable: true });
      })
      .finally(() => inFlightByDate.delete(today));
    return { generationId };
  });

  ipcMain.handle(IPC.BRIEF_REGEN_STATUS, (): RegenStatusDTO => {
    const today = isoDateLocal(new Date());
    const brief = briefRepo.findByDate(today);
    const count = brief?.generationCount ?? 0;
    return regenStatus(count);
  });

  // D.8: BRIEF_CANCEL — stub for now; full AbortController wiring deferred to v0.3.2
  ipcMain.handle(IPC.BRIEF_CANCEL, (_e, generationId: unknown): void => {
    const id = typeof generationId === 'string' ? generationId : '(unknown)';
    log.info(`BRIEF_CANCEL received for ${id} — not yet wired (deferred to v0.3.2)`);
  });

  ipcMain.handle(IPC.ANTHROPIC_STATUS, (): AnthropicStatusDTO => ({
    hasKey: hasAnthropicKey(),
    model: store.get('anthropic').model,
  }));

  ipcMain.handle(IPC.ANTHROPIC_SET_KEY, (_e, key: unknown): void => {
    if (typeof key !== 'string' || key.length === 0) {
      throw new Error('IPC validation: API key must be a non-empty string');
    }
    if (key.length > 500) {
      throw new Error('IPC validation: API key exceeds maximum length');
    }
    if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key.trim())) {
      throw new Error('IPC validation: API key format is invalid — expected sk-ant-...');
    }
    writeAnthropicKey(key);
  });

  ipcMain.handle(IPC.ANTHROPIC_SET_MODEL, (_e, modelId: unknown): void => {
    if (typeof modelId !== 'string' || !(Object.values(MODEL_IDS) as string[]).includes(modelId)) {
      throw new Error(`IPC validation: modelId must be one of: ${Object.values(MODEL_IDS).join(', ')}`);
    }
    const current = store.get('anthropic');
    store.set('anthropic', { ...current, model: modelId });
  });

  ipcMain.handle(IPC.ANTHROPIC_TEST, async (): Promise<{ ok: boolean; error?: string }> => {
    return testConnection();
  });

  ipcMain.handle(IPC.ANTHROPIC_CLEAR_KEY, (): void => {
    clearAnthropicKey();
  });
}

function broadcast(channel: string, ...args: unknown[]): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send(channel, ...args);
  }
}
