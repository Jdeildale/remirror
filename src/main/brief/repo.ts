import type Database from 'better-sqlite3';
import type { DailyBriefDTO, StructuredTail } from '@shared/types';

export class BriefRepo {
  constructor(private db: Database.Database) {}

  upsert(b: DailyBriefDTO): void {
    this.db.prepare(`
      INSERT INTO daily_briefs (
        date, generated_at, generation_count, model, prompt_version,
        input_tokens, output_tokens, headline, story, what_held,
        what_fragmented, tomorrow_first_90, raw_markdown, structured_tail
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        generated_at=excluded.generated_at,
        generation_count=excluded.generation_count,
        model=excluded.model,
        prompt_version=excluded.prompt_version,
        input_tokens=excluded.input_tokens,
        output_tokens=excluded.output_tokens,
        headline=excluded.headline,
        story=excluded.story,
        what_held=excluded.what_held,
        what_fragmented=excluded.what_fragmented,
        tomorrow_first_90=excluded.tomorrow_first_90,
        raw_markdown=excluded.raw_markdown,
        structured_tail=excluded.structured_tail
    `).run(
      b.date, b.generatedAt, b.generationCount, b.model, b.promptVersion,
      b.inputTokens, b.outputTokens, b.headline, b.story, b.whatHeld,
      b.whatFragmented, b.tomorrowFirst90, b.rawMarkdown,
      b.structuredTail ? JSON.stringify(b.structuredTail) : null,
    );
  }

  findByDate(date: string): DailyBriefDTO | null {
    const row = this.db.prepare('SELECT * FROM daily_briefs WHERE date = ?').get(date) as Record<string, unknown> | undefined;
    if (!row) return null;
    return rowToDTO(row);
  }

  listPast(limit: number): DailyBriefDTO[] {
    const rows = this.db.prepare('SELECT * FROM daily_briefs ORDER BY date DESC LIMIT ?').all(limit) as Array<Record<string, unknown>>;
    return rows.map(rowToDTO);
  }


}

function rowToDTO(r: Record<string, unknown>): DailyBriefDTO {
  let tail: StructuredTail | null = null;
  if (typeof r.structured_tail === 'string' && r.structured_tail.length > 0) {
    try { tail = JSON.parse(r.structured_tail) as StructuredTail; } catch { tail = null; }
  }
  return {
    date: r.date as string,
    generatedAt: r.generated_at as number,
    generationCount: r.generation_count as number,
    model: r.model as string,
    promptVersion: r.prompt_version as string,
    inputTokens: r.input_tokens as number,
    outputTokens: r.output_tokens as number,
    headline: r.headline as string,
    story: r.story as string,
    whatHeld: r.what_held as string,
    whatFragmented: r.what_fragmented as string,
    tomorrowFirst90: r.tomorrow_first_90 as string,
    rawMarkdown: r.raw_markdown as string,
    structuredTail: tail,
  };
}
