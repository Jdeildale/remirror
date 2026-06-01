import { uIOhook } from 'uiohook-napi';
import { EventEmitter } from 'events';
import log from '../log';

/**
 * Listens to global keyboard/mouse input and emits a debounced `'input'` event.
 * Does NOT record key content or positions — purely a "something happened" signal.
 *
 * Listener registration is intentionally done ONCE in the constructor so
 * repeated start/stop cycles don't accumulate handlers on uIOhook.
 */
export class InputGate extends EventEmitter {
  private started = false;
  private lastEmittedAt = 0;
  private readonly debounceMs = 250;
  private readonly handler: () => void;

  constructor() {
    super();
    this.handler = () => this.maybeEmit();
    // Register listeners exactly once. uIOhook.start()/stop() toggles the
    // native event pump; the listener registrations persist across cycles.
    uIOhook.on('keydown', this.handler);
    uIOhook.on('mousedown', this.handler);
    uIOhook.on('mousemove', this.handler);
    uIOhook.on('wheel', this.handler);
  }

  start(): void {
    if (this.started) return;
    try {
      uIOhook.start();
      this.started = true;
      log.info('InputGate started');
    } catch (err) {
      log.error('InputGate failed to start:', err);
      this.emit('error', err);
    }
  }

  stop(): void {
    if (!this.started) return;
    try {
      uIOhook.stop();
      this.started = false;
      log.info('InputGate stopped');
    } catch (err) {
      log.warn('InputGate stop failed:', err);
    }
  }

  private maybeEmit(): void {
    // Defensive: if uIOhook fires a final event after stop, drop it.
    if (!this.started) return;
    const now = Date.now();
    if (now - this.lastEmittedAt < this.debounceMs) return;
    this.lastEmittedAt = now;
    this.emit('input', now);
  }
}
