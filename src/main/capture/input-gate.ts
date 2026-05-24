import { uIOhook } from 'uiohook-napi';
import { EventEmitter } from 'events';
import log from '../log';

export class InputGate extends EventEmitter {
  private started = false;
  private lastEmittedAt = 0;
  private readonly debounceMs = 250;

  start(): void {
    if (this.started) return;
    try {
      uIOhook.on('keydown', () => this.maybeEmit());
      uIOhook.on('mousedown', () => this.maybeEmit());
      uIOhook.on('mousemove', () => this.maybeEmit());
      uIOhook.on('wheel', () => this.maybeEmit());
      uIOhook.start();
      this.started = true;
      log.info('InputGate started');
    } catch (err) {
      log.error('InputGate failed to start:', err);
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
    const now = Date.now();
    if (now - this.lastEmittedAt < this.debounceMs) return;
    this.lastEmittedAt = now;
    this.emit('input', now);
  }
}
