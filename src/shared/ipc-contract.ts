import type { Session, Project, Exclusion, EngineStatus } from './types';

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
} as const;

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
}
