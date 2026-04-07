CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mailbox_accounts (
  mailbox_id TEXT PRIMARY KEY,
  email_address TEXT NOT NULL,
  graph_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS mailbox_credentials (
  mailbox_id TEXT PRIMARY KEY REFERENCES mailbox_accounts(mailbox_id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider = 'outlook'),
  access_token TEXT NULL,
  refresh_token TEXT NULL,
  token_expires_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS mailbox_subscriptions (
  mailbox_id TEXT PRIMARY KEY REFERENCES mailbox_accounts(mailbox_id) ON DELETE CASCADE,
  subscription_id TEXT NOT NULL UNIQUE,
  client_state TEXT NOT NULL,
  subscription_version INTEGER NOT NULL,
  expiration_date_time TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS mailbox_cursors (
  mailbox_id TEXT PRIMARY KEY REFERENCES mailbox_accounts(mailbox_id) ON DELETE CASCADE,
  cursor_generation INTEGER NOT NULL,
  delta_token TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  mailbox_id TEXT NOT NULL REFERENCES mailbox_accounts(mailbox_id) ON DELETE CASCADE,
  internet_message_id TEXT NULL,
  subject TEXT NOT NULL,
  from_address TEXT NULL,
  to_addresses JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  preview TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  body_html_blob_key TEXT NULL,
  raw_payload_blob_key TEXT NULL,
  web_link TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS messages_mailbox_received_at_idx
  ON messages (mailbox_id, received_at DESC);

CREATE INDEX IF NOT EXISTS messages_internet_message_id_idx
  ON messages (internet_message_id);

CREATE TABLE IF NOT EXISTS message_rule_matches (
  id TEXT PRIMARY KEY,
  mailbox_id TEXT NOT NULL REFERENCES mailbox_accounts(mailbox_id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  rule_kind TEXT NOT NULL CHECK (
    rule_kind IN ('verification_code', 'reward', 'cashback', 'redeem')
  ),
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium')),
  reason TEXT NOT NULL,
  matched_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS message_rule_matches_message_id_idx
  ON message_rule_matches (message_id, created_at DESC);

CREATE TABLE IF NOT EXISTS hit_events (
  id TEXT PRIMARY KEY,
  dedupe_key TEXT NOT NULL UNIQUE,
  mailbox_id TEXT NOT NULL REFERENCES mailbox_accounts(mailbox_id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  rule_match_id TEXT NOT NULL REFERENCES message_rule_matches(id) ON DELETE CASCADE,
  hit_type TEXT NOT NULL CHECK (
    hit_type IN ('verification_code', 'reward', 'cashback', 'redeem')
  ),
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium')),
  processed BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS hit_events_mailbox_created_at_idx
  ON hit_events (mailbox_id, created_at DESC);

CREATE INDEX IF NOT EXISTS hit_events_processed_created_at_idx
  ON hit_events (processed, created_at DESC);

CREATE TABLE IF NOT EXISTS mailbox_current_signals (
  mailbox_id TEXT NOT NULL REFERENCES mailbox_accounts(mailbox_id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL CHECK (
    signal_type IN ('verification_code', 'reward', 'cashback', 'redeem')
  ),
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  rule_match_id TEXT NOT NULL REFERENCES message_rule_matches(id) ON DELETE CASCADE,
  hit_id TEXT NOT NULL REFERENCES hit_events(id) ON DELETE CASCADE,
  matched_text TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium')),
  message_received_at TIMESTAMPTZ NOT NULL,
  signal_created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (mailbox_id, signal_type)
);

CREATE INDEX IF NOT EXISTS mailbox_current_signals_signal_received_at_idx
  ON mailbox_current_signals (signal_type, message_received_at DESC, signal_created_at DESC);

CREATE TABLE IF NOT EXISTS mailbox_errors (
  id TEXT PRIMARY KEY,
  mailbox_id TEXT NOT NULL REFERENCES mailbox_accounts(mailbox_id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (
    stage IN ('webhook', 'fetch', 'parse', 'recover', 'renew', 'auth')
  ),
  summary TEXT NOT NULL,
  details TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS mailbox_errors_mailbox_created_at_idx
  ON mailbox_errors (mailbox_id, created_at DESC);
