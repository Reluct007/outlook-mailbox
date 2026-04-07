import type {
  CurrentSignalsQuery,
  ListHitsQuery,
  SignalHistoryQuery,
} from "../types";

export const UPSERT_MAILBOX_ACCOUNT_SQL = `
  INSERT INTO mailbox_accounts (
    mailbox_id,
    email_address,
    graph_user_id,
    provider_account_id,
    auth_status,
    created_at,
    updated_at
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7)
  ON CONFLICT (mailbox_id) DO UPDATE
  SET
    email_address = EXCLUDED.email_address,
    graph_user_id = EXCLUDED.graph_user_id,
    provider_account_id = EXCLUDED.provider_account_id,
    auth_status = EXCLUDED.auth_status,
    updated_at = EXCLUDED.updated_at
  RETURNING mailbox_id, email_address, graph_user_id, provider_account_id, auth_status, created_at, updated_at
`;

export const GET_MAILBOX_ACCOUNT_SQL = `
  SELECT mailbox_id, email_address, graph_user_id, provider_account_id, auth_status, created_at, updated_at
  FROM mailbox_accounts
  WHERE mailbox_id = $1
`;

export const LIST_MAILBOX_ACCOUNTS_SQL = `
  SELECT mailbox_id, email_address, graph_user_id, provider_account_id, auth_status, created_at, updated_at
  FROM mailbox_accounts
  ORDER BY mailbox_id ASC
`;

export const UPDATE_MAILBOX_AUTH_STATUS_SQL = `
  UPDATE mailbox_accounts
  SET auth_status = $2, updated_at = $3
  WHERE mailbox_id = $1
  RETURNING mailbox_id, email_address, graph_user_id, provider_account_id, auth_status, created_at, updated_at
`;

export const INSERT_CONNECT_INTENT_SQL = `
  INSERT INTO oauth_connect_intents (
    id,
    status,
    mode,
    asset_id,
    target_mailbox_id,
    state_nonce,
    pkce_code_verifier,
    redirect_after,
    expires_at,
    completed_at,
    failure_reason,
    created_at,
    updated_at
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, NULL, $10, $11)
  RETURNING id, status, mode, asset_id, target_mailbox_id, state_nonce, pkce_code_verifier, redirect_after, expires_at, completed_at, failure_reason, created_at, updated_at
`;

export const GET_CONNECT_INTENT_BY_ID_SQL = `
  SELECT id, status, mode, asset_id, target_mailbox_id, state_nonce, pkce_code_verifier, redirect_after, expires_at, completed_at, failure_reason, created_at, updated_at
  FROM oauth_connect_intents
  WHERE id = $1
`;

export const GET_CONNECT_INTENT_BY_STATE_NONCE_SQL = `
  SELECT id, status, mode, asset_id, target_mailbox_id, state_nonce, pkce_code_verifier, redirect_after, expires_at, completed_at, failure_reason, created_at, updated_at
  FROM oauth_connect_intents
  WHERE state_nonce = $1
`;

export const GET_LATEST_CONNECT_INTENT_BY_ASSET_ID_SQL = `
  SELECT id, status, mode, asset_id, target_mailbox_id, state_nonce, pkce_code_verifier, redirect_after, expires_at, completed_at, failure_reason, created_at, updated_at
  FROM oauth_connect_intents
  WHERE asset_id = $1
  ORDER BY created_at DESC
  LIMIT 1
`;

export const COMPLETE_CONNECT_INTENT_SQL = `
  UPDATE oauth_connect_intents
  SET
    status = 'completed',
    target_mailbox_id = $2,
    completed_at = $3,
    failure_reason = NULL,
    updated_at = $4
  WHERE id = $1
  RETURNING id, status, mode, asset_id, target_mailbox_id, state_nonce, pkce_code_verifier, redirect_after, expires_at, completed_at, failure_reason, created_at, updated_at
`;

export const FAIL_CONNECT_INTENT_SQL = `
  UPDATE oauth_connect_intents
  SET
    status = 'failed',
    failure_reason = $2,
    updated_at = $3
  WHERE id = $1
  RETURNING id, status, mode, asset_id, target_mailbox_id, state_nonce, pkce_code_verifier, redirect_after, expires_at, completed_at, failure_reason, created_at, updated_at
`;

export const EXPIRE_CONNECT_INTENT_SQL = `
  UPDATE oauth_connect_intents
  SET
    status = 'expired',
    updated_at = $2
  WHERE id = $1
  RETURNING id, status, mode, asset_id, target_mailbox_id, state_nonce, pkce_code_verifier, redirect_after, expires_at, completed_at, failure_reason, created_at, updated_at
`;

export const UPSERT_MAILBOX_CREDENTIAL_SQL = `
  INSERT INTO mailbox_credentials (
    mailbox_id,
    provider,
    access_token,
    refresh_token,
    token_expires_at,
    updated_at
  )
  VALUES ($1, 'outlook', $2, $3, $4, $5)
  ON CONFLICT (mailbox_id) DO UPDATE
  SET
    access_token = COALESCE(EXCLUDED.access_token, mailbox_credentials.access_token),
    refresh_token = COALESCE(EXCLUDED.refresh_token, mailbox_credentials.refresh_token),
    token_expires_at = COALESCE(EXCLUDED.token_expires_at, mailbox_credentials.token_expires_at),
    updated_at = EXCLUDED.updated_at
  RETURNING mailbox_id, provider, access_token, refresh_token, token_expires_at, updated_at
`;

export const GET_MAILBOX_CREDENTIAL_SQL = `
  SELECT mailbox_id, provider, access_token, refresh_token, token_expires_at, updated_at
  FROM mailbox_credentials
  WHERE mailbox_id = $1
`;

export const UPSERT_MAILBOX_SUBSCRIPTION_SQL = `
  INSERT INTO mailbox_subscriptions (
    mailbox_id,
    subscription_id,
    client_state,
    subscription_version,
    expiration_date_time,
    updated_at
  )
  VALUES ($1, $2, $3, $4, $5, $6)
  ON CONFLICT (mailbox_id) DO UPDATE
  SET
    subscription_id = EXCLUDED.subscription_id,
    client_state = EXCLUDED.client_state,
    subscription_version = EXCLUDED.subscription_version,
    expiration_date_time = EXCLUDED.expiration_date_time,
    updated_at = EXCLUDED.updated_at
  RETURNING mailbox_id, subscription_id, client_state, subscription_version, expiration_date_time, updated_at
`;

export const GET_MAILBOX_SUBSCRIPTION_SQL = `
  SELECT mailbox_id, subscription_id, client_state, subscription_version, expiration_date_time, updated_at
  FROM mailbox_subscriptions
  WHERE mailbox_id = $1
`;

export const RESOLVE_MAILBOX_BY_SUBSCRIPTION_ID_SQL = `
  SELECT mailbox_id, subscription_id, client_state, subscription_version, expiration_date_time, updated_at
  FROM mailbox_subscriptions
  WHERE subscription_id = $1
`;

export const UPSERT_MAILBOX_CURSOR_SQL = `
  INSERT INTO mailbox_cursors (
    mailbox_id,
    cursor_generation,
    delta_token,
    updated_at
  )
  VALUES ($1, $2, $3, $4)
  ON CONFLICT (mailbox_id) DO UPDATE
  SET
    cursor_generation = EXCLUDED.cursor_generation,
    delta_token = EXCLUDED.delta_token,
    updated_at = EXCLUDED.updated_at
  RETURNING mailbox_id, cursor_generation, delta_token, updated_at
`;

export const GET_MAILBOX_CURSOR_SQL = `
  SELECT mailbox_id, cursor_generation, delta_token, updated_at
  FROM mailbox_cursors
  WHERE mailbox_id = $1
`;

export const UPSERT_MESSAGE_SQL = `
  INSERT INTO messages (
    id,
    mailbox_id,
    internet_message_id,
    subject,
    from_address,
    to_addresses,
    received_at,
    preview,
    excerpt,
    body_html_blob_key,
    raw_payload_blob_key,
    web_link,
    created_at,
    updated_at
  )
  VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $14)
  ON CONFLICT (id) DO UPDATE
  SET
    mailbox_id = EXCLUDED.mailbox_id,
    internet_message_id = EXCLUDED.internet_message_id,
    subject = EXCLUDED.subject,
    from_address = EXCLUDED.from_address,
    to_addresses = EXCLUDED.to_addresses,
    received_at = EXCLUDED.received_at,
    preview = EXCLUDED.preview,
    excerpt = EXCLUDED.excerpt,
    body_html_blob_key = EXCLUDED.body_html_blob_key,
    raw_payload_blob_key = EXCLUDED.raw_payload_blob_key,
    web_link = EXCLUDED.web_link,
    created_at = EXCLUDED.created_at,
    updated_at = EXCLUDED.updated_at
  RETURNING id, mailbox_id, internet_message_id, subject, from_address, to_addresses, received_at, preview, excerpt, body_html_blob_key, raw_payload_blob_key, web_link, created_at, updated_at
`;

export const GET_MESSAGE_SQL = `
  SELECT id, mailbox_id, internet_message_id, subject, from_address, to_addresses, received_at, preview, excerpt, body_html_blob_key, raw_payload_blob_key, web_link, created_at, updated_at
  FROM messages
  WHERE id = $1
`;

export const UPSERT_RULE_MATCH_SQL = `
  INSERT INTO message_rule_matches (
    id,
    mailbox_id,
    message_id,
    rule_kind,
    confidence,
    reason,
    matched_text,
    created_at
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  ON CONFLICT (id) DO UPDATE
  SET
    mailbox_id = EXCLUDED.mailbox_id,
    message_id = EXCLUDED.message_id,
    rule_kind = EXCLUDED.rule_kind,
    confidence = EXCLUDED.confidence,
    reason = EXCLUDED.reason,
    matched_text = EXCLUDED.matched_text,
    created_at = EXCLUDED.created_at
`;

export const LIST_RULE_MATCHES_BY_MESSAGE_SQL = `
  SELECT id, mailbox_id, message_id, rule_kind, confidence, reason, matched_text, created_at
  FROM message_rule_matches
  WHERE message_id = $1
  ORDER BY created_at ASC, id ASC
`;

export const INSERT_HIT_EVENT_SQL = `
  INSERT INTO hit_events (
    id,
    dedupe_key,
    mailbox_id,
    message_id,
    rule_match_id,
    hit_type,
    confidence,
    processed,
    created_at
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  ON CONFLICT (dedupe_key) DO NOTHING
  RETURNING id, dedupe_key, mailbox_id, message_id, rule_match_id, hit_type, confidence, processed, created_at
`;

export const GET_HIT_EVENT_BY_DEDUPE_KEY_SQL = `
  SELECT id, dedupe_key, mailbox_id, message_id, rule_match_id, hit_type, confidence, processed, created_at
  FROM hit_events
  WHERE dedupe_key = $1
`;

export const LIST_HITS_FOR_MESSAGE_SQL = `
  SELECT id, dedupe_key, mailbox_id, message_id, rule_match_id, hit_type, confidence, processed, created_at
  FROM hit_events
  WHERE message_id = $1
  ORDER BY created_at ASC, id ASC
`;

export const UPSERT_CURRENT_SIGNAL_SQL = `
  INSERT INTO mailbox_current_signals (
    mailbox_id,
    signal_type,
    message_id,
    rule_match_id,
    hit_id,
    matched_text,
    confidence,
    message_received_at,
    signal_created_at,
    updated_at
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  ON CONFLICT (mailbox_id, signal_type) DO UPDATE
  SET
    message_id = EXCLUDED.message_id,
    rule_match_id = EXCLUDED.rule_match_id,
    hit_id = EXCLUDED.hit_id,
    matched_text = EXCLUDED.matched_text,
    confidence = EXCLUDED.confidence,
    message_received_at = EXCLUDED.message_received_at,
    signal_created_at = EXCLUDED.signal_created_at,
    updated_at = EXCLUDED.updated_at
  WHERE
    mailbox_current_signals.message_received_at < EXCLUDED.message_received_at
    OR (
      mailbox_current_signals.message_received_at = EXCLUDED.message_received_at
      AND mailbox_current_signals.signal_created_at <= EXCLUDED.signal_created_at
    )
  RETURNING mailbox_id, signal_type, message_id, rule_match_id, hit_id, matched_text, confidence, message_received_at, signal_created_at, updated_at
`;

export const GET_CURRENT_SIGNAL_SQL = `
  SELECT mailbox_id, signal_type, message_id, rule_match_id, hit_id, matched_text, confidence, message_received_at, signal_created_at, updated_at
  FROM mailbox_current_signals
  WHERE mailbox_id = $1 AND signal_type = $2
`;

export const GET_MESSAGE_DETAIL_RULE_MATCHES_SQL = LIST_RULE_MATCHES_BY_MESSAGE_SQL;

export const GET_MESSAGE_DETAIL_HITS_SQL = LIST_HITS_FOR_MESSAGE_SQL;

export const GET_MAILBOX_AGGREGATES_SQL = `
  SELECT
    $1::text AS mailbox_id,
    COALESCE((SELECT COUNT(*)::int FROM messages WHERE mailbox_id = $1), 0) AS total_messages,
    COALESCE((SELECT COUNT(*)::int FROM hit_events WHERE mailbox_id = $1), 0) AS total_hits,
    COALESCE((SELECT COUNT(*)::int FROM hit_events WHERE mailbox_id = $1 AND processed = false), 0) AS unprocessed_hits,
    (SELECT MAX(received_at) FROM messages WHERE mailbox_id = $1) AS latest_message_at,
    (SELECT MAX(created_at) FROM hit_events WHERE mailbox_id = $1) AS latest_hit_at
`;

export const INSERT_MAILBOX_ERROR_SQL = `
  INSERT INTO mailbox_errors (
    id,
    mailbox_id,
    stage,
    summary,
    details,
    created_at
  )
  VALUES ($1, $2, $3, $4, $5, $6)
`;

export interface BuiltQuery {
  sql: string;
  values: readonly unknown[];
}

export function buildListHitsQuery(query: ListHitsQuery): BuiltQuery {
  const clauses: string[] = [];
  const values: unknown[] = [];

  if (query.mailboxId) {
    values.push(query.mailboxId);
    clauses.push(`mailbox_id = $${values.length}`);
  }

  if (query.processed !== undefined) {
    values.push(query.processed);
    clauses.push(`processed = $${values.length}`);
  }

  if (query.hitType) {
    values.push(query.hitType);
    clauses.push(`hit_type = $${values.length}`);
  }

  values.push(query.limit ?? 50);

  return {
    sql: `
      SELECT id, dedupe_key, mailbox_id, message_id, rule_match_id, hit_type, confidence, processed, created_at
      FROM hit_events
      ${clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY created_at DESC, id DESC
      LIMIT $${values.length}
    `,
    values,
  };
}

export function buildListCurrentSignalsQuery(query: CurrentSignalsQuery): BuiltQuery {
  const clauses: string[] = [];
  const values: unknown[] = [];

  if (query.mailboxId) {
    values.push(query.mailboxId);
    clauses.push(`mailbox_id = $${values.length}`);
  }

  if (query.signalType) {
    values.push(query.signalType);
    clauses.push(`signal_type = $${values.length}`);
  }

  values.push(query.limit ?? 100);

  return {
    sql: `
      SELECT mailbox_id, signal_type, message_id, rule_match_id, hit_id, matched_text, confidence, message_received_at, signal_created_at, updated_at
      FROM mailbox_current_signals
      ${clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY message_received_at DESC, signal_created_at DESC, hit_id DESC
      LIMIT $${values.length}
    `,
    values,
  };
}

export function buildListSignalHistoryQuery(query: SignalHistoryQuery): BuiltQuery {
  const clauses: string[] = [];
  const values: unknown[] = [];

  if (query.mailboxId) {
    values.push(query.mailboxId);
    clauses.push(`h.mailbox_id = $${values.length}`);
  }

  if (query.signalType) {
    values.push(query.signalType);
    clauses.push(`h.hit_type = $${values.length}`);
  }

  values.push(query.limit ?? 50);

  return {
    sql: `
      SELECT
        h.mailbox_id,
        h.message_id,
        h.rule_match_id,
        h.id AS hit_id,
        h.hit_type AS signal_type,
        rm.matched_text,
        h.confidence,
        m.received_at AS message_received_at,
        h.created_at AS signal_created_at
      FROM hit_events h
      INNER JOIN message_rule_matches rm ON rm.id = h.rule_match_id
      INNER JOIN messages m ON m.id = h.message_id
      ${clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY m.received_at DESC, h.created_at DESC, h.id DESC
      LIMIT $${values.length}
    `,
    values,
  };
}
