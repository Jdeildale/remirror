export interface LongestBlock {
  durationMs: number;
  projectLabel: string;
  startTime: number; // Unix ms
}

export interface DayShape {
  focusedMs: number;
  elsewhereMs: number;
  longest: LongestBlock | null;
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const hUnit = h === 1 ? 'hour' : 'hours';
  const mUnit = m === 1 ? 'minute' : 'minutes';
  return `${h} ${hUnit} ${m} ${mUnit}`;
}

function formatBlockDuration(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  return `${totalMin} min`;
}

function formatTimeOfDay(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes();
  const period = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mPad = m.toString().padStart(2, '0');
  return `${h12}:${mPad}${period}`;
}

export function generateTruthHeadline(shape: DayShape): string {
  const focused = formatDuration(shape.focusedMs);
  const elsewhere = formatDuration(shape.elsewhereMs);
  const base = `${focused} of focused work. ${elsewhere} elsewhere.`;
  if (!shape.longest) return base;
  const lbDur = formatBlockDuration(shape.longest.durationMs);
  const lbTime = formatTimeOfDay(shape.longest.startTime);
  return `${base} Longest stretch: ${lbDur} on ${shape.longest.projectLabel} at ${lbTime}.`;
}
