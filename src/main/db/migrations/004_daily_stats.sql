CREATE TABLE daily_stats (
  date TEXT PRIMARY KEY,
  computed_at INTEGER NOT NULL,
  focus_blocks_count INTEGER NOT NULL,
  switches_count INTEGER NOT NULL,
  focused_ms INTEGER NOT NULL,
  elsewhere_ms INTEGER NOT NULL,
  longest_block_id TEXT,
  longest_block_ms INTEGER NOT NULL DEFAULT 0,
  calendar_kept INTEGER NOT NULL DEFAULT 0,
  calendar_partial INTEGER NOT NULL DEFAULT 0,
  calendar_missed INTEGER NOT NULL DEFAULT 0,
  raw_json TEXT
);
