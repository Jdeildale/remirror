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

export type EngineStatus = 'active' | 'paused' | 'excluded' | 'stopped';

export interface CalendarEventDTO {
  id: string;
  startTimeMs: number;
  endTimeMs: number;
  title: string;
  projectLabel: string | null;
  status: 'kept' | 'partial' | 'did-not-start';
  overlapMs: number;
}

export interface DailyStatsDTO {
  date: string;
  focusBlocksCount: number;
  switchesCount: number;
  focusedMs: number;
  elsewhereMs: number;
  longestBlock: {
    id: string;
    durationMs: number;
    projectLabel: string;
    startTime: number;
  } | null;
}

export interface ProjectBreakdownDTO {
  label: string;
  totalMs: number;
  returnCount: number;
}

export interface WeeklyGoalDTO {
  text: string;
  projectLabel?: string;
  setAt: number;
}

export interface GoogleStatusDTO {
  connected: boolean;
  syncedAt: number | null;
  lastError: string | null;
}

export interface StructuredTail {
  dayShape: 'diffuse' | 'anchored' | 'fragmented_bursts' | 'stretched_focus' | 'rest';
  dominantFragmentationPattern: 'morning_drift' | 'afternoon_slip' | 'calendar_collision' | 'context_thrash' | 'none';
  tomorrowFirst90: {
    startLocal: string;
    target: string;
    supportingEventId: string | null;
    competingEventId: string | null;
  };
}

export interface DailyBriefDTO {
  date: string;
  generatedAt: number;
  generationCount: number;
  model: string;
  promptVersion: string;
  inputTokens: number;
  outputTokens: number;
  headline: string;
  story: string;
  whatHeld: string;
  whatFragmented: string;
  tomorrowFirst90: string;
  rawMarkdown: string;
  structuredTail: StructuredTail | null;
}

export interface RegenStatusDTO {
  used: number;
  cap: number;
  locked: boolean;
}

export interface AnthropicStatusDTO {
  hasKey: boolean;
  model: string;
}

export type BriefStreamEvent =
  | { kind: 'text_delta'; generationId: string; delta: string }
  | { kind: 'section_complete'; generationId: string; section: 'headline' | 'story' | 'what_held' | 'what_fragmented' | 'tomorrow_first_90' }
  | { kind: 'done'; generationId: string; brief: DailyBriefDTO }
  | { kind: 'error'; generationId: string; message: string; retryable: boolean }
  | { kind: 'reset_for_regen'; generationId: string };
