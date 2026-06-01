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
  private changeHandler: (() => void) | null = null;

  attachEngine(engine: CaptureEngine): void {
    if (this.engine === engine) return;
    // Remove old handler before re-attaching to a new engine
    if (this.engine && this.changeHandler) {
      this.engine.off('change', this.changeHandler);
    }
    this.engine = engine;
    this.changeHandler = () => this.invalidate();
    engine.on('change', this.changeHandler);
  }

  detachEngine(): void {
    if (this.engine && this.changeHandler) {
      this.engine.off('change', this.changeHandler);
    }
    this.engine = null;
    this.changeHandler = null;
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
