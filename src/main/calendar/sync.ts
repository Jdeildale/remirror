import { CalendarRepo } from './repo';
import { getAuthorizedClient } from '../google/auth';
import { fetchEventsForDate } from '../google/calendar';
import { store } from '../store';
import { getDatabase } from '../db/index';
import log from '../log';
import { Auth } from 'googleapis';

const SYNC_INTERVAL_MS = 15 * 60_000;

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export class CalendarSync {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private repo: CalendarRepo;
  private lastSyncAt: number | null = null;
  private lastError: string | null = null;

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
    this.running = true;
    try {
      const client = getAuthorizedClient();
      if (!client) {
        this.lastError = 'No Google credentials stored';
        return false;
      }
      const calId = store.get('google').calendarId ?? 'primary';
      const today = new Date();
      const events = await fetchEventsForDate(client as unknown as Auth.OAuth2Client, calId, today);
      const dateKey = isoDate(today);
      // Refresh today's events: delete then re-upsert (handles deleted events)
      this.repo.deleteByDate(dateKey);
      for (const e of events) {
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
      this.lastSyncAt = Date.now();
      this.lastError = null;
      store.set('google.syncedAt', this.lastSyncAt);
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
