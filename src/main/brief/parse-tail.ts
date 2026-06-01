import type { StructuredTail } from '@shared/types';

const DAY_SHAPES = ['diffuse', 'anchored', 'fragmented_bursts', 'stretched_focus', 'rest'] as const;
const FRAGMENTATION_PATTERNS = ['morning_drift', 'afternoon_slip', 'calendar_collision', 'context_thrash', 'none'] as const;

export function parseStructuredTail(markdown: string): StructuredTail | null {
  // Use the LAST json block — defense against prompt drift / inline examples earlier in the doc
  const matches = Array.from(markdown.matchAll(/```json\s*([\s\S]*?)```/g));
  if (matches.length === 0) return null;
  const match = matches[matches.length - 1];

  let raw: unknown;
  try { raw = JSON.parse(match[1]); } catch { return null; }
  if (!raw || typeof raw !== 'object') return null;

  const r = raw as Record<string, unknown>;
  const dayShape = r.day_shape;
  const pattern = r.dominant_fragmentation_pattern;
  const tomorrow = r.tomorrow_first_90;

  if (typeof dayShape !== 'string' || !(DAY_SHAPES as readonly string[]).includes(dayShape)) return null;
  if (typeof pattern !== 'string' || !(FRAGMENTATION_PATTERNS as readonly string[]).includes(pattern)) return null;
  if (!tomorrow || typeof tomorrow !== 'object') return null;

  const t = tomorrow as Record<string, unknown>;
  if (typeof t.start_local !== 'string' || !/^\d{2}:\d{2}$/.test(t.start_local)) return null;
  if (typeof t.target !== 'string' || t.target.length === 0) return null;
  if (t.supporting_event_id !== null && typeof t.supporting_event_id !== 'string') return null;
  if (t.competing_event_id !== null && typeof t.competing_event_id !== 'string') return null;

  return {
    dayShape: dayShape as StructuredTail['dayShape'],
    dominantFragmentationPattern: pattern as StructuredTail['dominantFragmentationPattern'],
    tomorrowFirst90: {
      startLocal: t.start_local,
      target: t.target,
      supportingEventId: t.supporting_event_id as string | null,
      competingEventId: t.competing_event_id as string | null,
    },
  };
}
