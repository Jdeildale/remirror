DROP TABLE IF EXISTS daily_briefs;
CREATE TABLE daily_briefs (
  date TEXT PRIMARY KEY,
  generated_at INTEGER NOT NULL,
  generation_count INTEGER NOT NULL DEFAULT 1,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  headline TEXT NOT NULL,
  story TEXT NOT NULL,
  what_held TEXT NOT NULL,
  what_fragmented TEXT NOT NULL,
  tomorrow_first_90 TEXT NOT NULL,
  raw_markdown TEXT NOT NULL,
  structured_tail TEXT
);
CREATE INDEX idx_daily_briefs_generated_at ON daily_briefs(generated_at DESC);
