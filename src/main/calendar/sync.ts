import { CalendarRepo } from './repo';
import { getAuthorizedClient } from '../google/auth';
import { fetchEventsForDate } from '../google/calendar';
import { store } from '../store';
import { getDatabase } from '../db/index';
import log from '../log';

const SYNC_INTERVAL_MS = 15 * 60_000;

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function eventLocalDate(startTimeMs: number): string {
  return isoDate(new Date(startTimeMs));
}

export class CalendarSync {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private repo: CalendarRepo;
  private lastSyncAt: number | null = null;
  private lastError: string | null = null;
  private lastSyncAttemptAt: number = 0;

  constructor() {
    this.repo = new CalendarRepo(getDatabase());
  }

  /** Start the polling loop. Idempotent. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.syncNow(), SYNC_INTERVAL_MS);
    this.timer.unref?.();
    void this.syncNow(); // fire once immediately
    log.info('CalendarSync started (15 min polling)');
  }

  /** Stop the polling loop. Idempotent. */
  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    log.info('CalendarSync stopped');
  }

  /** Manual sync trigger. Returns true on success. */
  async syncNow(): Promise<boolean> {
    if (this.running) return false;
    if (Date.now() - this.lastSyncAttemptAt < 60_000) {
      log.info('Calendar syncNow skipped: < 60s since last attempt');
      return false;
    }
    this.lastSyncAttemptAt = Date.now();
    this.running = true;
    try {
      const client = getAuthorizedClient();
      if (!client) {
        this.lastError = 'No Google credentials stored';
        return false;
      }
      const calId = store.get('google').calendarId ?? 'primary';
      const today = new Date();
      const events = await fetchEventsForDate(client, calId, today);
      const todayKey = isoDate(today);

      // Group fetched events by their actual local start-date.
      // Late-night or cross-midnight events belong to the day they started,
      // not the query-window date.
      const byDate = new Map<string, typeof events>();
      for (const e of events) {
        const key = eventLocalDate(e.startTimeMs);
        if (!byDate.has(key)) byDate.set(key, []);
        byDate.get(key)!.push(e);
      }

      // Always clear today even if no events came back (handles deletions).
      const clearedDates = new Set<string>();
      clearedDates.add(todayKey);
      this.repo.deleteByDate(todayKey);

      for (const [dateKey, group] of byDate) {
        if (!clearedDates.has(dateKey)) {
          this.repo.deleteByDate(dateKey);
          clearedDates.add(dateKey);
        }
        for (const e of group) {
          this.repo.upsert({
            id: e.id,
            date: dateKey,
            startTimeMs: e.startTimeMs,
            endTimeMs: e.endTimeMs,
            title: e.title,
            description: e.description,
            attendeesCount: e.attendeesCount,
            isAllDay: e.isAllDay,
            declined: e.declined,
            rawJson: e.rawJson,
          });
        }
      }
      this.lastSyncAt = Date.now();
      this.lastError = null;
      const g = store.get('google');
      store.set('google', { ...g, syncedAt: this.lastSyncAt });
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.lastError = msg;
      log.warn('Calendar sync failed', msg);
      return false;
    } finally {
      this.running = false;
    }
  }

  getStatus(): { lastSyncAt: number | null; lastError: string | null; running: boolean } {
    return { lastSyncAt: this.lastSyncAt, lastError: this.lastError, running: this.running };
  }
}
