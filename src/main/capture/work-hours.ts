/**
 * Work-hours gating: decides whether the current moment is inside the user's
 * configured work window. Pure function — caller passes in `now` and config,
 * function returns a boolean. Makes the behavior trivially testable.
 *
 * Defaults (Phase 1.5): 09:00–17:00 local time, Mon–Fri only.
 */

export interface WorkHoursConfig {
  /** Master switch — false means "always capture" (legacy behavior). */
  enabled: boolean;
  /** 24h start time, "HH:MM" local. Default '09:00'. */
  start: string;
  /** 24h end time, "HH:MM" local. Default '17:00'. */
  end: string;
  /** When true, also capture on Saturday/Sunday within the time window. */
  weekendsActive: boolean;
}

export const DEFAULT_WORK_HOURS: WorkHoursConfig = {
  enabled: true,
  start: '09:00',
  end: '17:00',
  weekendsActive: false,
};

function parseHHMM(s: string): { hours: number; minutes: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

/**
 * Returns true if `now` is inside the configured work window.
 * If enabled is false, always returns true (the gate is "open").
 */
export function isWithinWorkHours(now: Date, cfg: WorkHoursConfig): boolean {
  if (!cfg.enabled) return true;

  const start = parseHHMM(cfg.start);
  const end = parseHHMM(cfg.end);
  if (!start || !end) return true; // malformed config: fail open

  const day = now.getDay(); // 0 = Sunday, 6 = Saturday
  const isWeekend = day === 0 || day === 6;
  if (isWeekend && !cfg.weekendsActive) return false;

  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const minutesStart = start.hours * 60 + start.minutes;
  const minutesEnd = end.hours * 60 + end.minutes;

  // Standard same-day window. If end <= start, treat the window as empty
  // (the user can use 23:59 as end if they want full day).
  if (minutesEnd <= minutesStart) return false;

  return minutesNow >= minutesStart && minutesNow < minutesEnd;
}
