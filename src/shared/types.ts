export type SessionKind = 'work' | 'transition' | 'meeting' | 'idle' | 'excluded';

export interface Session {
  id: string;
  start_time: number;       // Unix ms
  end_time: number | null;
  app_name: string | null;
  window_title: string | null;
  display_id: number | null;
  project_label: string | null;
  confidence: number;
  kind: SessionKind;
  frames_sampled: number;
  paused_ms: number;
}

export interface Project {
  id: string;
  label: string;
  category: string | null;
  keywords: string[];        // parsed from JSON
  goal_id: string | null;
  display_order: number;
}

export interface Exclusion {
  id: string;
  app_name: string | null;
  window_title_contains: string | null;
  reason: string | null;
}

export type EngineStatus = 'active' | 'paused' | 'excluded' | 'off-hours' | 'stopped';
