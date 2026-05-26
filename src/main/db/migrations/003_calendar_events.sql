CREATE TABLE calendar_events (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  start_time INTEGER NOT NULL,
  end_time INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  attendees_count INTEGER DEFAULT 0,
  is_all_day INTEGER DEFAULT 0,
  declined INTEGER DEFAULT 0,
  project_label TEXT,
  source TEXT NOT NULL DEFAULT 'google',
  raw_json TEXT,
  fetched_at INTEGER NOT NULL
);
CREATE INDEX idx_calendar_events_date ON calendar_events(date);
CREATE INDEX idx_calendar_events_start ON calendar_events(start_time);
