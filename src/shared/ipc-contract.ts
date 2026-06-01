import type {
  Session,
  Project,
  Exclusion,
  EngineStatus,
  CalendarEventDTO,
  DailyStatsDTO,
  ProjectBreakdownDTO,
  WeeklyGoalDTO,
  GoogleStatusDTO,
  DailyBriefDTO,
  RegenStatusDTO,
  AnthropicStatusDTO,
  BriefStreamEvent,
} from './types';

export const IPC = {
  // Engine
  ENGINE_STATUS_GET: 'engine:status:get',
  ENGINE_STATUS_CHANGED: 'engine:status:changed',
  ENGINE_PAUSE: 'engine:pause',
  ENGINE_RESUME: 'engine:resume',

  // Sessions
  SESSIONS_RECENT: 'sessions:recent',
  SESSIONS_TODAY_STATS: 'sessions:today_stats',
  SESSIONS_RECLASSIFY: 'sessions:reclassify',
  SESSIONS_CHANGED: 'sessions:changed',

  // Projects
  PROJECTS_LIST: 'projects:list',
  PROJECTS_UPSERT: 'projects:upsert',
  PROJECTS_DELETE: 'projects:delete',
  PROJECTS_CHANGED: 'projects:changed',

  // Exclusions
  EXCLUSIONS_LIST: 'exclusions:list',
  EXCLUSIONS_UPSERT: 'exclusions:upsert',
  EXCLUSIONS_DELETE: 'exclusions:delete',

  // Onboarding
  ONBOARDING_NEEDED: 'onboarding:needed',
  ONBOARDING_COMPLETE: 'onboarding:complete',

  // Navigation
  NAVIGATE: 'navigate',

  // Work hours
  WORK_HOURS_GET: 'work_hours:get',
  WORK_HOURS_SET: 'work_hours:set',

  // Stats
  STATS_TODAY: 'stats:today',
  STATS_PROJECT_BREAKDOWN: 'stats:project_breakdown',

  // Calendar
  CALENDAR_LIST_TODAY: 'calendar:list_today',
  CALENDAR_REFRESH: 'calendar:refresh',
  CALENDAR_STATUS: 'calendar:status',

  // Google
  GOOGLE_CONNECT: 'google:connect',
  GOOGLE_DISCONNECT: 'google:disconnect',
  GOOGLE_STATUS: 'google:status',
  GOOGLE_STATUS_CHANGED: 'google:status:changed',

  // Goal
  GOAL_GET: 'goal:get',
  GOAL_SET: 'goal:set',

  // Brief
  BRIEF_TODAY: 'brief:today',
  BRIEF_LIST_PAST: 'brief:list_past',
  BRIEF_GENERATE: 'brief:generate',
  BRIEF_STREAM: 'brief:stream',
  BRIEF_REGEN_STATUS: 'brief:regen_status',
  BRIEF_CANCEL: 'brief:cancel',

  // Anthropic
  ANTHROPIC_STATUS: 'anthropic:status',
  ANTHROPIC_SET_KEY: 'anthropic:set_key',
  ANTHROPIC_SET_MODEL: 'anthropic:set_model',
  ANTHROPIC_TEST: 'anthropic:test',
  ANTHROPIC_CLEAR_KEY: 'anthropic:clear_key',
} as const;

export interface WorkHoursConfigDTO {
  enabled: boolean;
  start: string;
  end: string;
  weekendsActive: boolean;
}

export interface TodayStats {
  totalSessions: number;
  topProjects: Array<{ label: string; totalMs: number }>;
  longestBlockMs: number;
}

export interface RemirrorAPI {
  getEngineStatus(): Promise<EngineStatus>;
  onEngineStatusChanged(cb: (status: EngineStatus) => void): () => void;
  pauseCapture(): Promise<void>;
  resumeCapture(): Promise<void>;

  recentSessions(limit: number): Promise<Session[]>;
  todayStats(): Promise<TodayStats>;
  reclassifySession(id: string, projectLabel: string): Promise<void>;
  onSessionsChanged(cb: () => void): () => void;

  listProjects(): Promise<Project[]>;
  upsertProject(p: Omit<Project, 'id'> & { id?: string }): Promise<Project>;
  deleteProject(id: string): Promise<void>;

  listExclusions(): Promise<Exclusion[]>;
  upsertExclusion(e: Omit<Exclusion, 'id'> & { id?: string }): Promise<Exclusion>;
  deleteExclusion(id: string): Promise<void>;

  isOnboardingNeeded(): Promise<boolean>;
  completeOnboarding(): Promise<void>;

  onNavigate(cb: (route: 'status' | 'settings:projects' | 'settings:exclusions' | 'settings:schedule') => void): () => void;

  getWorkHours(): Promise<WorkHoursConfigDTO>;
  setWorkHours(cfg: WorkHoursConfigDTO): Promise<void>;

  todayStatsV2(): Promise<DailyStatsDTO>;
  projectBreakdown(): Promise<ProjectBreakdownDTO[]>;
  calendarListToday(): Promise<CalendarEventDTO[]>;
  calendarRefresh(): Promise<boolean>;
  googleConnect(): Promise<GoogleStatusDTO>;
  googleDisconnect(): Promise<void>;
  googleStatus(): Promise<GoogleStatusDTO>;
  onGoogleStatusChanged(cb: (s: GoogleStatusDTO) => void): () => void;
  getGoal(): Promise<WeeklyGoalDTO | null>;
  setGoal(g: { text: string; projectLabel?: string } | null): Promise<WeeklyGoalDTO | null>;

  briefToday(): Promise<DailyBriefDTO | null>;
  briefListPast(limit?: number): Promise<DailyBriefDTO[]>;
  briefGenerate(): Promise<{ generationId: string }>;
  briefRegenStatus(): Promise<RegenStatusDTO>;
  /** Cancel an in-flight brief generation. No-op if generationId is not in-flight. Deferred: v0.3.2 */
  briefCancel(generationId: string): Promise<void>;
  onBriefStream(cb: (e: BriefStreamEvent) => void): () => void;
  anthropicStatus(): Promise<AnthropicStatusDTO>;
  anthropicSetKey(key: string): Promise<void>;
  anthropicSetModel(modelId: string): Promise<void>;
  anthropicTest(): Promise<{ ok: boolean; error?: string }>;
  anthropicClearKey(): Promise<void>;
}
