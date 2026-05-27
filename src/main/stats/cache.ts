import { computeDailyStats, type DailyStats } from './daily-stats';
import { getDatabase } from '../db/index';
import type { CaptureEngine } from '../capture/engine';

const TTL_MS = 60_000;

interface CacheEntry {
  computedAt: number;
  stats: DailyStats;
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
    if (this.cache && Date.now() - this.cache.computedAt < TTL_MS) {
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
