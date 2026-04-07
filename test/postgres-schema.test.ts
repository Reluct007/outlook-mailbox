import {
  applyPhase0Schema,
  createPgMemContext,
  withClient,
} from "./helpers/pg-test-utils";

describe("phase0 postgres schema", () => {
  it("可以创建全部 11 张表", async () => {
    const context = createPgMemContext();
    await applyPhase0Schema(context);

    await withClient(context, async (client) => {
      const result = await client.query<{
        table_name: string;
      }>(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name ASC
      `);

      expect(result.rows.map((row) => row.table_name)).toEqual([
        "hit_events",
        "mailbox_accounts",
        "mailbox_credentials",
        "mailbox_current_signals",
        "mailbox_cursors",
        "mailbox_errors",
        "mailbox_subscriptions",
        "message_rule_matches",
        "messages",
        "oauth_connect_intents",
        "schema_migrations",
      ]);
    });
  });

  it("具备关键唯一约束与 check 约束", async () => {
    const context = createPgMemContext();
    await applyPhase0Schema(context);

    await withClient(context, async (client) => {
      await client.query(`
        INSERT INTO mailbox_accounts (mailbox_id, email_address, graph_user_id, created_at, updated_at)
        VALUES ('mailbox-1', 'ops@example.com', 'graph-user-1', NOW(), NOW())
      `);
      await client.query(`
        INSERT INTO mailbox_accounts (mailbox_id, email_address, graph_user_id, created_at, updated_at)
        VALUES ('mailbox-2', 'ops-2@example.com', 'graph-user-2', NOW(), NOW())
      `);
      await client.query(`
        INSERT INTO messages (
          id, mailbox_id, internet_message_id, subject, from_address, to_addresses,
          received_at, preview, excerpt, body_html_blob_key, raw_payload_blob_key,
          web_link, created_at, updated_at
        ) VALUES (
          'message-1', 'mailbox-1', NULL, 'hello', NULL, '[]'::jsonb,
          NOW(), 'preview', 'excerpt', NULL, NULL, NULL, NOW(), NOW()
        )
      `);
      await client.query(`
        INSERT INTO message_rule_matches (
          id, mailbox_id, message_id, rule_kind, confidence, reason, matched_text, created_at
        ) VALUES (
          'match-1', 'mailbox-1', 'message-1', 'reward', 'high', 'keyword', 'reward', NOW()
        )
      `);
      await client.query(`
        INSERT INTO mailbox_subscriptions (
          mailbox_id, subscription_id, client_state, subscription_version, expiration_date_time, updated_at
        ) VALUES (
          'mailbox-1', 'sub-1', 'client-state', 1, NULL, NOW()
        )
      `);
      await client.query(`
        INSERT INTO hit_events (
          id, dedupe_key, mailbox_id, message_id, rule_match_id, hit_type, confidence, processed, created_at
        ) VALUES (
          'hit-1', 'dedupe-1', 'mailbox-1', 'message-1', 'match-1', 'reward', 'high', false, NOW()
        )
      `);
      await client.query(`
        INSERT INTO mailbox_current_signals (
          mailbox_id, signal_type, message_id, rule_match_id, hit_id, matched_text,
          confidence, message_received_at, signal_created_at, updated_at
        ) VALUES (
          'mailbox-1', 'reward', 'message-1', 'match-1', 'hit-1', 'reward',
          'high', NOW(), NOW(), NOW()
        )
      `);

      await expect(
        client.query(`
          INSERT INTO mailbox_subscriptions (
            mailbox_id, subscription_id, client_state, subscription_version, expiration_date_time, updated_at
          ) VALUES (
            'mailbox-2', 'sub-1', 'client-state', 1, NULL, NOW()
          )
        `),
      ).rejects.toThrow();

      await expect(
        client.query(`
          INSERT INTO hit_events (
            id, dedupe_key, mailbox_id, message_id, rule_match_id, hit_type, confidence, processed, created_at
          ) VALUES (
            'hit-2', 'dedupe-1', 'mailbox-1', 'message-1', 'match-1', 'reward', 'high', false, NOW()
          )
        `),
      ).rejects.toThrow();

      await expect(
        client.query(`
          INSERT INTO mailbox_credentials (
            mailbox_id, provider, access_token, refresh_token, token_expires_at, updated_at
          ) VALUES (
            'mailbox-1', 'gmail', NULL, NULL, NULL, NOW()
          )
        `),
      ).rejects.toThrow();

      await expect(
        client.query(`
          INSERT INTO message_rule_matches (
            id, mailbox_id, message_id, rule_kind, confidence, reason, matched_text, created_at
          ) VALUES (
            'match-2', 'mailbox-1', 'message-1', 'invalid_kind', 'high', 'keyword', 'reward', NOW()
          )
        `),
      ).rejects.toThrow();

      await expect(
        client.query(`
          INSERT INTO mailbox_current_signals (
            mailbox_id, signal_type, message_id, rule_match_id, hit_id, matched_text,
            confidence, message_received_at, signal_created_at, updated_at
          ) VALUES (
            'mailbox-1', 'reward', 'message-1', 'match-1', 'hit-1', 'reward',
            'high', NOW(), NOW(), NOW()
          )
        `),
      ).rejects.toThrow();
    });
  });

  it("具备外键与级联删除", async () => {
    const context = createPgMemContext();
    await applyPhase0Schema(context);

    await withClient(context, async (client) => {
      await client.query(`
        INSERT INTO mailbox_accounts (mailbox_id, email_address, graph_user_id, created_at, updated_at)
        VALUES ('mailbox-1', 'ops@example.com', 'graph-user-1', NOW(), NOW())
      `);
      await client.query(`
        INSERT INTO messages (
          id, mailbox_id, internet_message_id, subject, from_address, to_addresses,
          received_at, preview, excerpt, body_html_blob_key, raw_payload_blob_key,
          web_link, created_at, updated_at
        ) VALUES (
          'message-1', 'mailbox-1', NULL, 'hello', NULL, '[]'::jsonb,
          NOW(), 'preview', 'excerpt', NULL, NULL, NULL, NOW(), NOW()
        )
      `);
      await client.query(`
        INSERT INTO message_rule_matches (
          id, mailbox_id, message_id, rule_kind, confidence, reason, matched_text, created_at
        ) VALUES (
          'match-1', 'mailbox-1', 'message-1', 'reward', 'high', 'keyword', 'reward', NOW()
        )
      `);
      await client.query(`
        INSERT INTO hit_events (
          id, dedupe_key, mailbox_id, message_id, rule_match_id, hit_type, confidence, processed, created_at
        ) VALUES (
          'hit-1', 'dedupe-1', 'mailbox-1', 'message-1', 'match-1', 'reward', 'high', false, NOW()
        )
      `);
      await client.query(`
        INSERT INTO mailbox_current_signals (
          mailbox_id, signal_type, message_id, rule_match_id, hit_id, matched_text,
          confidence, message_received_at, signal_created_at, updated_at
        ) VALUES (
          'mailbox-1', 'reward', 'message-1', 'match-1', 'hit-1', 'reward',
          'high', NOW(), NOW(), NOW()
        )
      `);

      await client.query(`DELETE FROM mailbox_accounts WHERE mailbox_id = 'mailbox-1'`);

      const messageCount = await client.query(`SELECT COUNT(*)::int AS count FROM messages`);
      const matchCount = await client.query(
        `SELECT COUNT(*)::int AS count FROM message_rule_matches`,
      );
      const hitCount = await client.query(`SELECT COUNT(*)::int AS count FROM hit_events`);
      const currentSignalCount = await client.query(
        `SELECT COUNT(*)::int AS count FROM mailbox_current_signals`,
      );

      expect(messageCount.rows[0]?.count).toBe(0);
      expect(matchCount.rows[0]?.count).toBe(0);
      expect(hitCount.rows[0]?.count).toBe(0);
      expect(currentSignalCount.rows[0]?.count).toBe(0);
    });
  });
});
