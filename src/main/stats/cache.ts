import { computeDailyStats, type DailyStats } from './daily-stats';
import { getDatabase } from '../db/index';
import type { CaptureEngine } from '../capture/engine';

const TTL_MS = 60_000;

interface CacheEntry {
  computedAt: number;
  stats: DailyStats;
}

function isoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export class DailyStatsCache {
  private cache: CacheEntry | null = null;
  private engine: CaptureEngine | null = null;

  attachEngine(engine: CaptureEngine): void {
    if (this.engine === engine) return;
    this.engine = engine;
    engine.on('change', () => this.invalidate());
  }

  get(now: Date = new Date()): DailyStats {
    const todayIso = isoDateLocal(now);
    if (
      this.cache &&
      this.cache.stats.date === todayIso &&
      Date.now() - this.cache.computedAt < TTL_MS
    ) {
      return this.cache.stats;
    }
    const fresh = computeDailyStats(getDatabase(), now);
    this.cache = { computedAt: Date.now(), stats: fresh };
    return fresh;
  }

  invalidate(): void {
    this.cache = null;
  }
}

// Singleton
export const dailyStatsCache = new DailyStatsCache();
