-- Idempotent insert: uses INSERT OR IGNORE keyed on (app_name, window_title_contains).
-- The IDs are deterministic so re-running doesn't duplicate.

INSERT OR IGNORE INTO exclusions (id, app_name, window_title_contains, reason) VALUES
  ('seed-app-1password', '1Password', NULL, 'Password manager'),
  ('seed-app-bitwarden', 'Bitwarden', NULL, 'Password manager'),
  ('seed-app-keychain', 'Keychain Access', NULL, 'Password manager'),
  ('seed-app-messages', 'Messages', NULL, 'Private messaging'),
  ('seed-app-imessage', 'iMessage', NULL, 'Private messaging'),
  ('seed-app-whatsapp', 'WhatsApp', NULL, 'Private messaging'),
  ('seed-app-signal', 'Signal', NULL, 'Private messaging'),
  ('seed-app-telegram', 'Telegram', NULL, 'Private messaging'),
  ('seed-app-facetime', 'FaceTime', NULL, 'Private messaging'),
  ('seed-title-password', NULL, 'password', 'Title contains "password"'),
  ('seed-title-bank', NULL, 'bank', 'Banking sites'),
  ('seed-title-chase', NULL, 'chase', 'Banking sites'),
  ('seed-title-login', NULL, 'login', 'Login pages'),
  ('seed-title-signin', NULL, 'sign in', 'Sign-in pages'),
  ('seed-title-2fa', NULL, '2fa', 'Two-factor authentication'),
  ('seed-title-auth', NULL, 'authentication', 'Authentication pages');
