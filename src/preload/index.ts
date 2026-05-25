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
};

contextBridge.exposeInMainWorld('remirror', api);
