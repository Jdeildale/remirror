import { EventEmitter } from 'events';
import { powerMonitor } from 'electron';
import type Database from 'better-sqlite3';
import { SessionRepo, type OpenSessionInput } from './sessions';
import { classify } from './classifier';
import { isExcluded } from './exclusions';
import { evaluateIdle } from './idle';
import { pollActiveWindow } from './window-poller';
import { getCursorSnapshot } from './cursor';
import { InputGate } from './input-gate';
import type { Project, Exclusion, EngineStatus } from '@shared/types';
import log from '../log';

const TICK_DEBOUNCE_MS = 1500;
const HEARTBEAT_INTERVAL_MS = 90_000;
const PAUSE_THRESHOLD_SEC = 120;
const CLOSE_THRESHOLD_SEC = 600;

interface ActiveSessionState {
  id: string;
  startTime: number;
  appName: string | null;
  windowTitle: string | null;
  pausedMs: number;
  idleStartedAt: number | null;
  lastHeartbeatAt: number;
}

export class CaptureEngine extends EventEmitter {
  private repo: SessionRepo;
  private projects: Project[] = [];
  private exclusions: Exclusion[] = [];
  private status: EngineStatus = 'stopped';
  private active: ActiveSessionState | null = null;
  private inputGate = new InputGate();
  private tickPending = false;
  private lastTickAt = 0;

  constructor(private db: Database.Database) {
    super();
    this.repo = new SessionRepo(db);
    this.inputGate.on('input', () => this.scheduleTick());
  }

  reloadProjects(): void {
    const rows = this.db.prepare('SELECT * FROM projects ORDER BY display_order, id').all() as Array<any>;
    this.projects = rows.map(r => ({ ...r, keywords: JSON.parse(r.keywords ?? '[]') }));
  }

  reloadExclusions(): void {
    this.exclusions = this.db.prepare('SELECT * FROM exclusions').all() as Exclusion[];
  }

  start(): void {
    if (this.status !== 'stopped' && this.status !== 'paused') return;
    this.reloadProjects();
    this.reloadExclusions();
    this.inputGate.start();
    this.status = 'active';
    this.emit('status', this.status);
    log.info('CaptureEngine started');
  }

  pause(): void {
    if (this.status === 'paused') return;
    this.closeActive(Date.now());
    this.inputGate.stop();
    this.status = 'paused';
    this.emit('status', this.status);
    log.info('CaptureEngine paused');
  }

  resume(): void {
    if (this.status !== 'paused') return;
    this.start();
  }

  stop(): void {
    this.closeActive(Date.now());
    this.inputGate.stop();
    this.status = 'stopped';
    this.emit('status', this.status);
    log.info('CaptureEngine stopped');
  }

  getStatus(): EngineStatus {
    return this.status;
  }

  // Called by lifecycle handlers (suspend / lock-screen / before-quit).
  closeActiveNow(reason: string): void {
    if (!this.active) return;
    log.info(`Closing active session: ${reason}`);
    this.closeActive(Date.now());
  }

  private scheduleTick(): void {
    if (this.status !== 'active') return;
    const now = Date.now();
    if (now - this.lastTickAt < TICK_DEBOUNCE_MS) return;
    if (this.tickPending) return;
    this.tickPending = true;
    setTimeout(() => this.tick().catch(err => log.error('tick error', err)), TICK_DEBOUNCE_MS);
  }

  private async tick(): Promise<void> {
    this.tickPending = false;
    this.lastTickAt = Date.now();
    if (this.status !== 'active') return;

    const now = Date.now();
    const idleSeconds = powerMonitor.getSystemIdleTime();
    const win = await pollActiveWindow();
    const cur = getCursorSnapshot();

    // Idle evaluation always runs first, regardless of window state.
    if (this.active) {
      const outcome = evaluateIdle({
        idleSeconds,
        now,
        pauseThresholdSec: PAUSE_THRESHOLD_SEC,
        closeThresholdSec: CLOSE_THRESHOLD_SEC,
        session: {
          startTime: this.active.startTime,
          pausedMs: this.active.pausedMs,
          idleStartedAt: this.active.idleStartedAt,
        },
      });
      if (outcome.action === 'close') {
        this.repo.close(this.active.id, outcome.closeAt);
        this.active = null;
        this.emitChange();
        return;
      }
      if (outcome.action === 'pause') {
        this.active.idleStartedAt = outcome.idleStartedAt;
        return;
      }
      if (outcome.action === 'resume') {
        this.repo.addPausedMs(this.active.id, outcome.addPausedMs);
        this.active.pausedMs += outcome.addPausedMs;
        this.active.idleStartedAt = null;
      }
      // active or resume → fall through to window-change check
    }

    if (!win) return;

    // Exclusion check — before any session is opened or kept.
    if (isExcluded({ appName: win.appName, windowTitle: win.windowTitle }, this.exclusions)) {
      if (this.active) {
        this.closeActive(now);
      }
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if ((this.status as EngineStatus) !== 'excluded') {
        this.status = 'excluded';
        this.emit('status', this.status);
      }
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if ((this.status as EngineStatus) === 'excluded') {
      this.status = 'active';
      this.emit('status', this.status);
    }

    const changed =
      !this.active ||
      this.active.appName !== win.appName ||
      this.active.windowTitle !== win.windowTitle;

    if (!changed) {
      // Heartbeat keep-alive.
      if (this.active && now - this.active.lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS) {
        this.repo.heartbeat(this.active.id, now);
        this.active.lastHeartbeatAt = now;
      }
      return;
    }

    // Transition.
    if (this.active) this.closeActive(now);

    const classification = classify(
      { appName: win.appName, windowTitle: win.windowTitle },
      this.projects,
    );
    const input: OpenSessionInput = {
      startTime: now,
      appName: win.appName,
      windowTitle: win.windowTitle,
      displayId: cur?.displayId ?? null,
      projectLabel: classification.label,
      confidence: classification.confidence,
    };
    const id = this.repo.open(input);
    this.active = {
      id,
      startTime: now,
      appName: win.appName,
      windowTitle: win.windowTitle,
      pausedMs: 0,
      idleStartedAt: null,
      lastHeartbeatAt: now,
    };
    this.emitChange();
  }

  private closeActive(now: number): void {
    if (!this.active) return;
    this.repo.close(this.active.id, now);
    this.active = null;
    this.emitChange();
  }

  private emitChange(): void {
    this.emit('change');
  }
}
