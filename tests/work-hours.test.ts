import { describe, it, expect } from 'vitest';
import { isWithinWorkHours, DEFAULT_WORK_HOURS } from '@main/capture/work-hours';

// Helper: build a local-time Date for a specific day-of-week and HH:MM.
// Uses 2026-W22 as the reference week:
//   Monday    2026-05-25
//   Tuesday   2026-05-26
//   Wednesday 2026-05-27
//   Thursday  2026-05-28
//   Friday    2026-05-29
//   Saturday  2026-05-30
//   Sunday    2026-05-31
function at(day: number, hours: number, minutes = 0): Date {
  // day: 1=Mon ... 7=Sun. Map to date numbers in May 2026.
  const dates = [null, 25, 26, 27, 28, 29, 30, 31];
  return new Date(2026, 4, dates[day]!, hours, minutes, 0); // month is 0-indexed: 4 = May
}

describe('isWithinWorkHours', () => {
  it('returns true when feature is disabled (failsafe to legacy)', () => {
    const cfg = { ...DEFAULT_WORK_HOURS, enabled: false };
    expect(isWithinWorkHours(at(1, 3), cfg)).toBe(true); // 3am Monday
    expect(isWithinWorkHours(at(6, 12), cfg)).toBe(true); // noon Saturday
  });

  it('weekday 09:00 is inclusive of start', () => {
    expect(isWithinWorkHours(at(1, 9, 0), DEFAULT_WORK_HOURS)).toBe(true);
  });

  it('weekday 16:59 is inside', () => {
    expect(isWithinWorkHours(at(3, 16, 59), DEFAULT_WORK_HOURS)).toBe(true);
  });

  it('weekday 17:00 is OUTSIDE (end is exclusive)', () => {
    expect(isWithinWorkHours(at(3, 17, 0), DEFAULT_WORK_HOURS)).toBe(false);
  });

  it('weekday 08:59 is outside', () => {
    expect(isWithinWorkHours(at(2, 8, 59), DEFAULT_WORK_HOURS)).toBe(false);
  });

  it('weekday midnight is outside', () => {
    expect(isWithinWorkHours(at(2, 0, 0), DEFAULT_WORK_HOURS)).toBe(false);
  });

  it('Saturday is outside by default (weekendsActive=false)', () => {
    expect(isWithinWorkHours(at(6, 12, 0), DEFAULT_WORK_HOURS)).toBe(false);
  });

  it('Sunday is outside by default', () => {
    expect(isWithinWorkHours(at(7, 12, 0), DEFAULT_WORK_HOURS)).toBe(false);
  });

  it('Saturday is inside when weekendsActive=true and time matches', () => {
    const cfg = { ...DEFAULT_WORK_HOURS, weekendsActive: true };
    expect(isWithinWorkHours(at(6, 10, 0), cfg)).toBe(true);
  });

  it('Saturday early morning is outside even with weekendsActive=true', () => {
    const cfg = { ...DEFAULT_WORK_HOURS, weekendsActive: true };
    expect(isWithinWorkHours(at(6, 7, 0), cfg)).toBe(false);
  });

  it('custom window 06:00–22:00 works', () => {
    const cfg = { ...DEFAULT_WORK_HOURS, start: '06:00', end: '22:00' };
    expect(isWithinWorkHours(at(1, 6, 0), cfg)).toBe(true);
    expect(isWithinWorkHours(at(1, 21, 59), cfg)).toBe(true);
    expect(isWithinWorkHours(at(1, 22, 0), cfg)).toBe(false);
    expect(isWithinWorkHours(at(1, 5, 59), cfg)).toBe(false);
  });

  it('malformed start/end fails open (returns true)', () => {
    const cfg = { ...DEFAULT_WORK_HOURS, start: 'banana', end: '17:00' };
    expect(isWithinWorkHours(at(1, 14, 0), cfg)).toBe(true);
  });

  it('empty window (end <= start) returns false on weekdays', () => {
    const cfg = { ...DEFAULT_WORK_HOURS, start: '17:00', end: '09:00' };
    expect(isWithinWorkHours(at(3, 12, 0), cfg)).toBe(false);
  });
});
