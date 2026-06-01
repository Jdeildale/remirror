import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type RemirrorAPI } from '@shared/ipc-contract';

const api: RemirrorAPI = {
  getEngineStatus: () => ipcRenderer.invoke(IPC.ENGINE_STATUS_GET),
  onEngineStatusChanged: (cb) => {
    const handler = (_e: unknown, status: any) => cb(status);
    ipcRenderer.on(IPC.ENGINE_STATUS_CHANGED, handler);
    return () => ipcRenderer.off(IPC.ENGINE_STATUS_CHANGED, handler);
  },
  pauseCapture: () => ipcRenderer.invoke(IPC.ENGINE_PAUSE),
  resumeCapture: () => ipcRenderer.invoke(IPC.ENGINE_RESUME),

  recentSessions: (limit) => ipcRenderer.invoke(IPC.SESSIONS_RECENT, limit),
  todayStats: () => ipcRenderer.invoke(IPC.SESSIONS_TODAY_STATS),
  reclassifySession: (id, label) => ipcRenderer.invoke(IPC.SESSIONS_RECLASSIFY, id, label),
  onSessionsChanged: (cb) => {
    const handler = () => cb();
    ipcRenderer.on(IPC.SESSIONS_CHANGED, handler);
    return () => ipcRenderer.off(IPC.SESSIONS_CHANGED, handler);
  },

  listProjects: () => ipcRenderer.invoke(IPC.PROJECTS_LIST),
  upsertProject: (p) => ipcRenderer.invoke(IPC.PROJECTS_UPSERT, p),
  deleteProject: (id) => ipcRenderer.invoke(IPC.PROJECTS_DELETE, id),

  listExclusions: () => ipcRenderer.invoke(IPC.EXCLUSIONS_LIST),
  upsertExclusion: (e) => ipcRenderer.invoke(IPC.EXCLUSIONS_UPSERT, e),
  deleteExclusion: (id) => ipcRenderer.invoke(IPC.EXCLUSIONS_DELETE, id),

  isOnboardingNeeded: () => ipcRenderer.invoke(IPC.ONBOARDING_NEEDED),
  completeOnboarding: () => ipcRenderer.invoke(IPC.ONBOARDING_COMPLETE),

  onNavigate: (cb) => {
    const handler = (_e: unknown, route: any) => cb(route);
    ipcRenderer.on(IPC.NAVIGATE, handler);
    return () => ipcRenderer.off(IPC.NAVIGATE, handler);
  },

  getWorkHours: () => ipcRenderer.invoke(IPC.WORK_HOURS_GET),
  setWorkHours: (cfg) => ipcRenderer.invoke(IPC.WORK_HOURS_SET, cfg),

  todayStatsV2: () => ipcRenderer.invoke(IPC.STATS_TODAY),
  projectBreakdown: () => ipcRenderer.invoke(IPC.STATS_PROJECT_BREAKDOWN),
  calendarListToday: () => ipcRenderer.invoke(IPC.CALENDAR_LIST_TODAY),
  calendarRefresh: () => ipcRenderer.invoke(IPC.CALENDAR_REFRESH),
  googleConnect: () => ipcRenderer.invoke(IPC.GOOGLE_CONNECT),
  googleDisconnect: () => ipcRenderer.invoke(IPC.GOOGLE_DISCONNECT),
  googleStatus: () => ipcRenderer.invoke(IPC.GOOGLE_STATUS),
  onGoogleStatusChanged: (cb) => {
    const handler = (_e: unknown, s: any) => cb(s);
    ipcRenderer.on(IPC.GOOGLE_STATUS_CHANGED, handler);
    return () => ipcRenderer.off(IPC.GOOGLE_STATUS_CHANGED, handler);
  },
  getGoal: () => ipcRenderer.invoke(IPC.GOAL_GET),
  setGoal: (g) => ipcRenderer.invoke(IPC.GOAL_SET, g),

  briefToday: () => ipcRenderer.invoke(IPC.BRIEF_TODAY),
  briefListPast: (limit) => ipcRenderer.invoke(IPC.BRIEF_LIST_PAST, limit),
  briefGenerate: () => ipcRenderer.invoke(IPC.BRIEF_GENERATE),
  briefRegenStatus: () => ipcRenderer.invoke(IPC.BRIEF_REGEN_STATUS),
  onBriefStream: (cb) => {
    const handler = (_e: unknown, evt: unknown) => cb(evt as never);
    ipcRenderer.on(IPC.BRIEF_STREAM, handler);
    return () => ipcRenderer.off(IPC.BRIEF_STREAM, handler);
  },
  anthropicStatus: () => ipcRenderer.invoke(IPC.ANTHROPIC_STATUS),
  anthropicSetKey: (key) => ipcRenderer.invoke(IPC.ANTHROPIC_SET_KEY, key),
  anthropicSetModel: (modelId) => ipcRenderer.invoke(IPC.ANTHROPIC_SET_MODEL, modelId),
  anthropicTest: () => ipcRenderer.invoke(IPC.ANTHROPIC_TEST),
  anthropicClearKey: () => ipcRenderer.invoke(IPC.ANTHROPIC_CLEAR_KEY),
};

contextBridge.exposeInMainWorld('remirror', api);
