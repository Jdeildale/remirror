import type Database from 'better-sqlite3';

const FOCUS_BLOCK_THRESHOLD_MS = 20 * 60_000;

export interface DailyStats {
  date: string; // YYYY-MM-DD local
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

function dayBounds(now: Date): { startMs: number; endMs: number; isoDate: string } {
  const s = new Date(now);
  s.setHours(0, 0, 0, 0);
  const e = new Date(now);
  e.setHours(23, 59, 59, 999);
  const y = s.getFullYear();
  const m = (s.getMonth() + 1).toString().padStart(2, '0');
  const dd = s.getDate().toString().padStart(2, '0');
  return { startMs: s.getTime(), endMs: e.getTime(), isoDate: `${y}-${m}-${dd}` };
}

export function computeDailyStats(db: Database.Database, now: Date): DailyStats {
  const { startMs, endMs, isoDate } = dayBounds(now);

  const rows = db.prepare(`
    SELECT id, start_time, end_time, paused_ms, project_label, kind
    FROM sessions
    WHERE start_time >= ? AND start_time <= ? AND end_time IS NOT NULL
  `).all(startMs, endMs) as Array<{
    id: string;
    start_time: number;
    end_time: number;
    paused_ms: number;
    project_label: string | null;
    kind: string;
  }>;

  let focusBlocksCount = 0;
  let focusedMs = 0;
  let elsewhereMs = 0;
  let longest: DailyStats['longestBlock'] = null;

  for (const r of rows) {
    const effective = Math.max(0, r.end_time - r.start_time - r.paused_ms);

    if (r.kind === 'work') {
      if (r.project_label === 'unclassified' || r.project_label === null) {
        elsewhereMs += effective;
      } else {
        focusedMs += effective;
      }
    } else if (r.kind === 'transition') {
      elsewhereMs += effective;
    }

    if (r.kind === 'work' && effective >= FOCUS_BLOCK_THRESHOLD_MS) {
      focusBlocksCount += 1;
    }

    if (!longest || effective > longest.durationMs) {
      longest = {
        id: r.id,
        durationMs: effective,
        projectLabel: r.project_label ?? 'unclassified',
        startTime: r.start_time,
      };
    }
  }

  // If the longest is 0, treat as null (no usable longest block to feature)
  if (longest && longest.durationMs === 0) longest = null;

  return {
    date: isoDate,
    focusBlocksCount,
    switchesCount: rows.length,
    focusedMs,
    elsewhereMs,
    longestBlock: longest,
  };
}
