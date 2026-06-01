import { describe, it, expect } from 'vitest';
import { parseStructuredTail } from '@main/brief/parse-tail';

describe('parseStructuredTail', () => {
  it('extracts and parses a code-fenced JSON tail', () => {
    const md = `Body text.

\`\`\`json
{
  "day_shape": "diffuse",
  "dominant_fragmentation_pattern": "morning_drift",
  "tomorrow_first_90": {
    "start_local": "09:00",
    "target": "Oracle dashboard",
    "supporting_event_id": null,
    "competing_event_id": "evt-123"
  }
}
\`\`\``;
    const result = parseStructuredTail(md);
    expect(result).toEqual({
      dayShape: 'diffuse',
      dominantFragmentationPattern: 'morning_drift',
      tomorrowFirst90: {
        startLocal: '09:00',
        target: 'Oracle dashboard',
        supportingEventId: null,
        competingEventId: 'evt-123',
      },
    });
  });

  it('returns null when there is no JSON block', () => {
    expect(parseStructuredTail('plain text only')).toBeNull();
  });

  it('returns null when JSON is malformed', () => {
    const md = `\`\`\`json\n{ broken json\n\`\`\``;
    expect(parseStructuredTail(md)).toBeNull();
  });

  it('returns null when required fields are missing', () => {
    const md = `\`\`\`json\n{"day_shape":"anchored"}\n\`\`\``;
    expect(parseStructuredTail(md)).toBeNull();
  });

  it('returns null when day_shape value is outside the enum', () => {
    const md = `\`\`\`json\n{"day_shape":"perfect","dominant_fragmentation_pattern":"none","tomorrow_first_90":{"start_local":"09:00","target":"X","supporting_event_id":null,"competing_event_id":null}}\n\`\`\``;
    expect(parseStructuredTail(md)).toBeNull();
  });

  it('returns null when dominant_fragmentation_pattern value is outside the enum', () => {
    const md = `\`\`\`json\n{"day_shape":"diffuse","dominant_fragmentation_pattern":"chaos","tomorrow_first_90":{"start_local":"09:00","target":"X","supporting_event_id":null,"competing_event_id":null}}\n\`\`\``;
    expect(parseStructuredTail(md)).toBeNull();
  });

  it('picks the LAST json block when an earlier valid block exists (defense vs prompt drift)', () => {
    const firstBlock = JSON.stringify({
      day_shape: 'diffuse',
      dominant_fragmentation_pattern: 'none',
      tomorrow_first_90: { start_local: '07:00', target: 'Fake target', supporting_event_id: null, competing_event_id: null },
    });
    const realBlock = JSON.stringify({
      day_shape: 'anchored',
      dominant_fragmentation_pattern: 'morning_drift',
      tomorrow_first_90: { start_local: '09:00', target: 'Oracle dashboard', supporting_event_id: null, competing_event_id: null },
    });
    const md = `## Story\nSome text.\n\n\`\`\`json\n${firstBlock}\n\`\`\`\n\n## Tomorrow\nFoo.\n\n\`\`\`json\n${realBlock}\n\`\`\``;

    const result = parseStructuredTail(md);
    expect(result).not.toBeNull();
    // Must pick the LAST block (anchored), not the first (diffuse)
    expect(result!.dayShape).toBe('anchored');
    expect(result!.tomorrowFirst90.target).toBe('Oracle dashboard');
  });
});
