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
});
