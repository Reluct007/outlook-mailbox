ALTER TABLE mailbox_accounts
  ADD COLUMN IF NOT EXISTS provider_account_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS auth_status TEXT NOT NULL DEFAULT 'active'
    CHECK (auth_status IN ('pending_auth', 'active', 'reauth_required', 'disabled'));

CREATE TABLE IF NOT EXISTS oauth_connect_intents (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'expired', 'failed')),
  mode TEXT NOT NULL CHECK (mode IN ('connect', 'reauth')),
  mailbox_label TEXT NULL,
  target_mailbox_id TEXT NULL REFERENCES mailbox_accounts(mailbox_id) ON DELETE SET NULL,
  state_nonce TEXT NOT NULL UNIQUE,
  pkce_code_verifier TEXT NOT NULL,
  redirect_after TEXT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NULL,
  failure_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS oauth_connect_intents_status_expires_at_idx
  ON oauth_connect_intents (status, expires_at ASC);
