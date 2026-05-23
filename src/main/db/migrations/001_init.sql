-- Sessions: the core record
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  start_time INTEGER NOT NULL,
  end_time INTEGER,
  app_name TEXT,
  window_title TEXT,
  display_id INTEGER,
  project_label TEXT,
  confidence REAL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'work',
  frames_sampled INTEGER DEFAULT 0,
  paused_ms INTEGER DEFAULT 0
);
CREATE INDEX idx_sessions_start_time ON sessions(start_time);
CREATE INDEX idx_sessions_project_label ON sessions(project_label);
CREATE INDEX idx_sessions_kind ON sessions(kind);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  category TEXT,
  keywords TEXT NOT NULL DEFAULT '[]',
  goal_id TEXT,
  display_order INTEGER DEFAULT 0
);

CREATE TABLE exclusions (
  id TEXT PRIMARY KEY,
  app_name TEXT,
  window_title_contains TEXT,
  reason TEXT
);

-- Reserved for Phases 2-5; created now to avoid future schema breaks.
CREATE TABLE meetings (
  id TEXT PRIMARY KEY,
  start_time INTEGER NOT NULL,
  end_time INTEGER,
  platform TEXT DEFAULT 'zoom',
  meeting_id TEXT,
  participants TEXT,
  fathom_summary TEXT,
  action_items TEXT,
  fathom_meeting_id TEXT,
  raw_transcript TEXT
);
CREATE TABLE screenshots (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id),
  captured_at INTEGER NOT NULL,
  file_path TEXT,
  classified INTEGER DEFAULT 0,
  delete_after INTEGER
);
CREATE TABLE goals (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  category TEXT,
  tracking_keywords TEXT,
  created_at INTEGER,
  active INTEGER DEFAULT 1
);
CREATE TABLE weekly_targets (
  id TEXT PRIMARY KEY,
  week_start INTEGER NOT NULL,
  metric_name TEXT,
  baseline_value REAL,
  target_value REAL,
  actual_value REAL,
  target_description TEXT,
  met INTEGER
);
CREATE TABLE daily_briefs (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  generated_at INTEGER,
  content TEXT,
  best_focus_block_id TEXT,
  context_switch_count INTEGER,
  fragmentation_score REAL,
  goal_alignment_score REAL
);
CREATE TABLE weekly_mirrors (
  id TEXT PRIMARY KEY,
  week_start TEXT NOT NULL,
  generated_at INTEGER,
  content TEXT,
  target_id TEXT,
  open_loops TEXT,
  top_insight TEXT
);

CREATE TABLE _migrations (
  filename TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
