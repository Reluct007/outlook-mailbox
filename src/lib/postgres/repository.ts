import type { FactsRepository } from "../facts-repository";
import type {
  CurrentSignalsQuery,
  HitEventFact,
  ListHitsQuery,
  MailboxAccountFact,
  MailboxAggregates,
  MailboxCredentialFact,
  MailboxCurrentSignalFact,
  MailboxCursorFact,
  MailboxErrorFact,
  MailboxSubscriptionFact,
  MessageDetailView,
  MessageFact,
  MessageRuleMatchFact,
  OnboardMailboxRequest,
  SaveParseArtifactsInput,
  SaveParseArtifactsResult,
  SignalHistoryEntry,
  SignalHistoryQuery,
} from "../types";
import {
  GET_CURRENT_SIGNAL_SQL,
  GET_HIT_EVENT_BY_DEDUPE_KEY_SQL,
  GET_MAILBOX_ACCOUNT_SQL,
  GET_MAILBOX_AGGREGATES_SQL,
  GET_MAILBOX_CREDENTIAL_SQL,
  GET_MAILBOX_CURSOR_SQL,
  GET_MAILBOX_SUBSCRIPTION_SQL,
  GET_MESSAGE_DETAIL_HITS_SQL,
  GET_MESSAGE_DETAIL_RULE_MATCHES_SQL,
  GET_MESSAGE_SQL,
  INSERT_HIT_EVENT_SQL,
  INSERT_MAILBOX_ERROR_SQL,
  LIST_MAILBOX_ACCOUNTS_SQL,
  LIST_RULE_MATCHES_BY_MESSAGE_SQL,
  RESOLVE_MAILBOX_BY_SUBSCRIPTION_ID_SQL,
  UPSERT_CURRENT_SIGNAL_SQL,
  UPSERT_MAILBOX_ACCOUNT_SQL,
  UPSERT_MAILBOX_CREDENTIAL_SQL,
  UPSERT_MAILBOX_CURSOR_SQL,
  UPSERT_MAILBOX_SUBSCRIPTION_SQL,
  UPSERT_MESSAGE_SQL,
  UPSERT_RULE_MATCH_SQL,
  buildListCurrentSignalsQuery,
  buildListHitsQuery,
  buildListSignalHistoryQuery,
} from "./sql";
import {
  createPostgresDriver,
  type PostgresClientConstructor,
  type PostgresDriver,
  type PostgresQueryable,
} from "./client";
import type { PostgresConnectionConfig } from "./config";

interface CreatePostgresFactsRepositoryOptions {
  driver?: PostgresDriver;
  ClientCtor?: PostgresClientConstructor;
}

type TimestampValue =
  | string
  | Date
  | null
  | undefined
  | [string | Date]
  | [string | Date | null];

interface MailboxAccountRow {
  mailbox_id: string;
  email_address: string;
  graph_user_id: string;
  created_at: TimestampValue;
  updated_at: TimestampValue;
}

interface MailboxCredentialRow {
  mailbox_id: string;
  provider: "outlook";
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: TimestampValue;
  updated_at: TimestampValue;
}

interface MailboxSubscriptionRow {
  mailbox_id: string;
  subscription_id: string;
  client_state: string;
  subscription_version: number;
  expiration_date_time: TimestampValue;
  updated_at: TimestampValue;
}

interface MailboxCursorRow {
  mailbox_id: string;
  cursor_generation: number;
  delta_token: string | null;
  updated_at: TimestampValue;
}

interface MessageRow {
  id: string;
  mailbox_id: string;
  internet_message_id: string | null;
  subject: string;
  from_address: string | null;
  to_addresses: unknown;
  received_at: TimestampValue;
  preview: string;
  excerpt: string;
  body_html_blob_key: string | null;
  raw_payload_blob_key: string | null;
  web_link: string | null;
  created_at: TimestampValue;
  updated_at: TimestampValue;
}

interface MessageRuleMatchRow {
  id: string;
  mailbox_id: string;
  message_id: string;
  rule_kind: MessageRuleMatchFact["ruleKind"];
  confidence: MessageRuleMatchFact["confidence"];
  reason: string;
  matched_text: string;
  created_at: TimestampValue;
}

interface HitEventRow {
  id: string;
  dedupe_key: string;
  mailbox_id: string;
  message_id: string;
  rule_match_id: string;
  hit_type: HitEventFact["hitType"];
  confidence: HitEventFact["confidence"];
  processed: boolean;
  created_at: TimestampValue;
}

interface CurrentSignalRow {
  mailbox_id: string;
  signal_type: MailboxCurrentSignalFact["signalType"];
  message_id: string;
  rule_match_id: string;
  hit_id: string;
  matched_text: string;
  confidence: MailboxCurrentSignalFact["confidence"];
  message_received_at: TimestampValue;
  signal_created_at: TimestampValue;
  updated_at: TimestampValue;
}

interface SignalHistoryRow {
  mailbox_id: string;
  message_id: string;
  rule_match_id: string;
  hit_id: string;
  signal_type: SignalHistoryEntry["signalType"];
  matched_text: string;
  confidence: SignalHistoryEntry["confidence"];
  message_received_at: TimestampValue;
  signal_created_at: TimestampValue;
}

interface MailboxAggregatesRow {
  mailbox_id: string;
  total_messages: number;
  total_hits: number;
  unprocessed_hits: number;
  latest_message_at: TimestampValue;
  latest_hit_at: TimestampValue;
}

function toIsoString(value: TimestampValue): string {
  if (Array.isArray(value)) {
    return toIsoString(value[0]);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    return new Date(value).toISOString();
  }

  throw new Error("unexpected_null_timestamp");
}

function toOptionalIsoString(value: TimestampValue): string | null {
  if (Array.isArray(value)) {
    return value[0] == null ? null : toIsoString(value[0]);
  }

  return value == null ? null : toIsoString(value);
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
    return value;
  }

  if (typeof value === "string") {
    return JSON.parse(value) as string[];
  }

  throw new Error("invalid_to_addresses_value");
}

function getArtifactsMessageId(input: SaveParseArtifactsInput): string | null {
  const messageIds = new Set([
    ...input.matches.map((match) => match.messageId),
    ...input.hits.map((hit) => hit.messageId),
  ]);

  if (messageIds.size === 0) {
    return null;
  }

  if (messageIds.size !== 1) {
    throw new Error("save_parse_artifacts_requires_single_message");
  }

  return Array.from(messageIds)[0] ?? null;
}

function validateParseArtifacts(input: SaveParseArtifactsInput): void {
  const ruleMatchIds = new Set(input.matches.map((match) => match.id));

  for (const hit of input.hits) {
    if (!ruleMatchIds.has(hit.ruleMatchId)) {
      throw new Error(`parse_artifact_rule_match_missing:${hit.ruleMatchId}`);
    }
  }
}

function mapMailboxAccount(row: MailboxAccountRow): MailboxAccountFact {
  return {
    mailboxId: row.mailbox_id,
    emailAddress: row.email_address,
    graphUserId: row.graph_user_id,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapMailboxCredential(row: MailboxCredentialRow): MailboxCredentialFact {
  return {
    mailboxId: row.mailbox_id,
    provider: row.provider,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    tokenExpiresAt: toOptionalIsoString(row.token_expires_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapMailboxSubscription(row: MailboxSubscriptionRow): MailboxSubscriptionFact {
  return {
    mailboxId: row.mailbox_id,
    subscriptionId: row.subscription_id,
    clientState: row.client_state,
    subscriptionVersion: row.subscription_version,
    expirationDateTime: toOptionalIsoString(row.expiration_date_time),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapMailboxCursor(row: MailboxCursorRow): MailboxCursorFact {
  return {
    mailboxId: row.mailbox_id,
    cursorGeneration: row.cursor_generation,
    deltaToken: row.delta_token,
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapMessage(row: MessageRow): MessageFact {
  return {
    id: row.id,
    mailboxId: row.mailbox_id,
    internetMessageId: row.internet_message_id,
    subject: row.subject,
    fromAddress: row.from_address,
    toAddresses: toStringArray(row.to_addresses),
    receivedAt: toIsoString(row.received_at),
    preview: row.preview,
    excerpt: row.excerpt,
    bodyHtmlBlobKey: row.body_html_blob_key,
    rawPayloadBlobKey: row.raw_payload_blob_key,
    webLink: row.web_link,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapRuleMatch(row: MessageRuleMatchRow): MessageRuleMatchFact {
  return {
    id: row.id,
    mailboxId: row.mailbox_id,
    messageId: row.message_id,
    ruleKind: row.rule_kind,
    confidence: row.confidence,
    reason: row.reason,
    matchedText: row.matched_text,
    createdAt: toIsoString(row.created_at),
  };
}

function mapHitEvent(row: HitEventRow): HitEventFact {
  return {
    id: row.id,
    dedupeKey: row.dedupe_key,
    mailboxId: row.mailbox_id,
    messageId: row.message_id,
    ruleMatchId: row.rule_match_id,
    hitType: row.hit_type,
    confidence: row.confidence,
    processed: row.processed,
    createdAt: toIsoString(row.created_at),
  };
}

function mapCurrentSignal(row: CurrentSignalRow): MailboxCurrentSignalFact {
  return {
    mailboxId: row.mailbox_id,
    signalType: row.signal_type,
    messageId: row.message_id,
    ruleMatchId: row.rule_match_id,
    hitId: row.hit_id,
    matchedText: row.matched_text,
    confidence: row.confidence,
    messageReceivedAt: toIsoString(row.message_received_at),
    signalCreatedAt: toIsoString(row.signal_created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapSignalHistory(row: SignalHistoryRow): SignalHistoryEntry {
  return {
    mailboxId: row.mailbox_id,
    messageId: row.message_id,
    ruleMatchId: row.rule_match_id,
    hitId: row.hit_id,
    signalType: row.signal_type,
    matchedText: row.matched_text,
    confidence: row.confidence,
    messageReceivedAt: toIsoString(row.message_received_at),
    signalCreatedAt: toIsoString(row.signal_created_at),
  };
}

function mapMailboxAggregates(row: MailboxAggregatesRow): MailboxAggregates {
  return {
    mailboxId: row.mailbox_id,
    totalMessages: row.total_messages,
    totalHits: row.total_hits,
    unprocessedHits: row.unprocessed_hits,
    latestMessageAt: toOptionalIsoString(row.latest_message_at),
    latestHitAt: toOptionalIsoString(row.latest_hit_at),
  };
}

async function resolveHit(
  queryable: PostgresQueryable,
  hit: HitEventFact,
): Promise<HitEventFact> {
  const inserted = await queryable.query<HitEventRow>(INSERT_HIT_EVENT_SQL, [
    hit.id,
    hit.dedupeKey,
    hit.mailboxId,
    hit.messageId,
    hit.ruleMatchId,
    hit.hitType,
    hit.confidence,
    hit.processed,
    hit.createdAt,
  ]);

  const insertedRow = inserted.rows[0];
  if (insertedRow) {
    return mapHitEvent(insertedRow);
  }

  const existing = await queryable.query<HitEventRow>(
    GET_HIT_EVENT_BY_DEDUPE_KEY_SQL,
    [hit.dedupeKey],
  );
  const existingRow = existing.rows[0];
  if (!existingRow) {
    throw new Error(`hit_event_lookup_failed:${hit.dedupeKey}`);
  }

  return mapHitEvent(existingRow);
}

export class PostgresFactsRepository implements FactsRepository {
  constructor(private readonly driver: PostgresDriver) {}

  async upsertMailboxAccount(
    input: OnboardMailboxRequest,
  ): Promise<MailboxAccountFact> {
    const now = new Date().toISOString();
    const result = await this.driver.query<MailboxAccountRow>(
      UPSERT_MAILBOX_ACCOUNT_SQL,
      [
        input.mailboxId,
        input.emailAddress,
        input.graphUserId ?? input.emailAddress,
        now,
        now,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error(`mailbox_account_upsert_failed:${input.mailboxId}`);
    }

    return mapMailboxAccount(row);
  }

  async getMailboxAccount(mailboxId: string): Promise<MailboxAccountFact | null> {
    const result = await this.driver.query<MailboxAccountRow>(
      GET_MAILBOX_ACCOUNT_SQL,
      [mailboxId],
    );
    const row = result.rows[0];
    return row ? mapMailboxAccount(row) : null;
  }

  async listMailboxAccounts(): Promise<MailboxAccountFact[]> {
    const result = await this.driver.query<MailboxAccountRow>(
      LIST_MAILBOX_ACCOUNTS_SQL,
    );
    return result.rows.map(mapMailboxAccount);
  }

  async upsertMailboxCredential(input: {
    mailboxId: string;
    accessToken?: string;
    refreshToken?: string;
    tokenExpiresAt?: string;
  }): Promise<MailboxCredentialFact> {
    const now = new Date().toISOString();
    const result = await this.driver.query<MailboxCredentialRow>(
      UPSERT_MAILBOX_CREDENTIAL_SQL,
      [
        input.mailboxId,
        input.accessToken ?? null,
        input.refreshToken ?? null,
        input.tokenExpiresAt ?? null,
        now,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error(`mailbox_credential_upsert_failed:${input.mailboxId}`);
    }

    return mapMailboxCredential(row);
  }

  async getMailboxCredential(
    mailboxId: string,
  ): Promise<MailboxCredentialFact | null> {
    const result = await this.driver.query<MailboxCredentialRow>(
      GET_MAILBOX_CREDENTIAL_SQL,
      [mailboxId],
    );
    const row = result.rows[0];
    return row ? mapMailboxCredential(row) : null;
  }

  async upsertMailboxSubscription(input: {
    mailboxId: string;
    subscriptionId: string;
    clientState: string;
    subscriptionVersion: number;
    expirationDateTime: string | null;
  }): Promise<MailboxSubscriptionFact> {
    const result = await this.driver.query<MailboxSubscriptionRow>(
      UPSERT_MAILBOX_SUBSCRIPTION_SQL,
      [
        input.mailboxId,
        input.subscriptionId,
        input.clientState,
        input.subscriptionVersion,
        input.expirationDateTime,
        new Date().toISOString(),
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error(`mailbox_subscription_upsert_failed:${input.mailboxId}`);
    }

    return mapMailboxSubscription(row);
  }

  async getMailboxSubscription(
    mailboxId: string,
  ): Promise<MailboxSubscriptionFact | null> {
    const result = await this.driver.query<MailboxSubscriptionRow>(
      GET_MAILBOX_SUBSCRIPTION_SQL,
      [mailboxId],
    );
    const row = result.rows[0];
    return row ? mapMailboxSubscription(row) : null;
  }

  async resolveMailboxBySubscriptionId(
    subscriptionId: string,
  ): Promise<MailboxSubscriptionFact | null> {
    const result = await this.driver.query<MailboxSubscriptionRow>(
      RESOLVE_MAILBOX_BY_SUBSCRIPTION_ID_SQL,
      [subscriptionId],
    );
    const row = result.rows[0];
    return row ? mapMailboxSubscription(row) : null;
  }

  async upsertMailboxCursor(input: {
    mailboxId: string;
    cursorGeneration: number;
    deltaToken: string | null;
  }): Promise<MailboxCursorFact> {
    const result = await this.driver.query<MailboxCursorRow>(
      UPSERT_MAILBOX_CURSOR_SQL,
      [
        input.mailboxId,
        input.cursorGeneration,
        input.deltaToken,
        new Date().toISOString(),
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error(`mailbox_cursor_upsert_failed:${input.mailboxId}`);
    }

    return mapMailboxCursor(row);
  }

  async getMailboxCursor(mailboxId: string): Promise<MailboxCursorFact | null> {
    const result = await this.driver.query<MailboxCursorRow>(
      GET_MAILBOX_CURSOR_SQL,
      [mailboxId],
    );
    const row = result.rows[0];
    return row ? mapMailboxCursor(row) : null;
  }

  async saveMessage(message: MessageFact): Promise<MessageFact> {
    const result = await this.driver.query<MessageRow>(UPSERT_MESSAGE_SQL, [
      message.id,
      message.mailboxId,
      message.internetMessageId,
      message.subject,
      message.fromAddress,
      JSON.stringify(message.toAddresses),
      message.receivedAt,
      message.preview,
      message.excerpt,
      message.bodyHtmlBlobKey,
      message.rawPayloadBlobKey,
      message.webLink,
      message.createdAt,
      message.updatedAt,
    ]);

    const row = result.rows[0];
    if (!row) {
      throw new Error(`message_upsert_failed:${message.id}`);
    }

    return mapMessage(row);
  }

  async getMessage(messageId: string): Promise<MessageFact | null> {
    const result = await this.driver.query<MessageRow>(GET_MESSAGE_SQL, [messageId]);
    const row = result.rows[0];
    return row ? mapMessage(row) : null;
  }

  async saveParseArtifacts(
    input: SaveParseArtifactsInput,
  ): Promise<SaveParseArtifactsResult> {
    validateParseArtifacts(input);

    const messageId = getArtifactsMessageId(input);

    if (!messageId) {
      return {
        matches: [],
        hits: [],
        currentSignals: [],
      };
    }

    return this.driver.transaction(async (queryable) => {
      for (const match of input.matches) {
        await queryable.query(UPSERT_RULE_MATCH_SQL, [
          match.id,
          match.mailboxId,
          match.messageId,
          match.ruleKind,
          match.confidence,
          match.reason,
          match.matchedText,
          match.createdAt,
        ]);
      }

      const matchesResult = await queryable.query<MessageRuleMatchRow>(
        LIST_RULE_MATCHES_BY_MESSAGE_SQL,
        [messageId],
      );
      const matches = matchesResult.rows.map(mapRuleMatch);
      const matchesById = new Map(matches.map((match) => [match.id, match]));

      const resolvedHits: HitEventFact[] = [];
      for (const hit of input.hits) {
        resolvedHits.push(await resolveHit(queryable, hit));
      }

      const messageResult = await queryable.query<MessageRow>(GET_MESSAGE_SQL, [messageId]);
      const messageRow = messageResult.rows[0];
      if (!messageRow) {
        throw new Error(`message_not_found:${messageId}`);
      }
      const message = mapMessage(messageRow);

      const currentSignals: MailboxCurrentSignalFact[] = [];
      const updatedAt = new Date().toISOString();
      for (const hit of resolvedHits) {
        const match = matchesById.get(hit.ruleMatchId);
        if (!match) {
          throw new Error(`rule_match_not_found:${hit.ruleMatchId}`);
        }

        const currentSignalResult = await queryable.query<CurrentSignalRow>(
          UPSERT_CURRENT_SIGNAL_SQL,
          [
            message.mailboxId,
            match.ruleKind,
            message.id,
            match.id,
            hit.id,
            match.matchedText,
            hit.confidence,
            message.receivedAt,
            hit.createdAt,
            updatedAt,
          ],
        );

        let currentSignalRow = currentSignalResult.rows[0];
        if (!currentSignalRow) {
          const existingCurrentSignal = await queryable.query<CurrentSignalRow>(
            GET_CURRENT_SIGNAL_SQL,
            [message.mailboxId, match.ruleKind],
          );
          currentSignalRow = existingCurrentSignal.rows[0];
        }

        if (!currentSignalRow) {
          throw new Error(
            `current_signal_resolution_failed:${message.mailboxId}:${match.ruleKind}`,
          );
        }

        currentSignals.push(mapCurrentSignal(currentSignalRow));
      }

      return {
        matches,
        hits: resolvedHits,
        currentSignals,
      };
    });
  }

  async listCurrentSignals(
    query: CurrentSignalsQuery,
  ): Promise<MailboxCurrentSignalFact[]> {
    const built = buildListCurrentSignalsQuery(query);
    const result = await this.driver.query<CurrentSignalRow>(built.sql, built.values);
    return result.rows.map(mapCurrentSignal);
  }

  async listSignalHistory(
    query: SignalHistoryQuery,
  ): Promise<SignalHistoryEntry[]> {
    const built = buildListSignalHistoryQuery(query);
    const result = await this.driver.query<SignalHistoryRow>(built.sql, built.values);
    return result.rows.map(mapSignalHistory);
  }

  async listHits(query: ListHitsQuery): Promise<HitEventFact[]> {
    const built = buildListHitsQuery(query);
    const result = await this.driver.query<HitEventRow>(built.sql, built.values);
    return result.rows.map(mapHitEvent);
  }

  async getMessageDetail(messageId: string): Promise<MessageDetailView | null> {
    const message = await this.getMessage(messageId);
    if (!message) {
      return null;
    }

    const [ruleMatchesResult, hitsResult] = await Promise.all([
      this.driver.query<MessageRuleMatchRow>(GET_MESSAGE_DETAIL_RULE_MATCHES_SQL, [
        messageId,
      ]),
      this.driver.query<HitEventRow>(GET_MESSAGE_DETAIL_HITS_SQL, [messageId]),
    ]);

    return {
      message,
      bodyHtml: null,
      blobMissing: false,
      ruleMatches: ruleMatchesResult.rows.map(mapRuleMatch),
      hits: hitsResult.rows.map(mapHitEvent),
    };
  }

  async getMailboxAggregates(mailboxId: string): Promise<MailboxAggregates> {
    const result = await this.driver.query<MailboxAggregatesRow>(
      GET_MAILBOX_AGGREGATES_SQL,
      [mailboxId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error(`mailbox_aggregates_lookup_failed:${mailboxId}`);
    }

    return mapMailboxAggregates(row);
  }

  async saveMailboxError(error: MailboxErrorFact): Promise<void> {
    await this.driver.query(INSERT_MAILBOX_ERROR_SQL, [
      error.id,
      error.mailboxId,
      error.stage,
      error.summary,
      error.details,
      error.createdAt,
    ]);
  }
}

export function createPostgresFactsRepository(
  config: PostgresConnectionConfig,
  options: CreatePostgresFactsRepositoryOptions = {},
): FactsRepository {
  const driver =
    options.driver ??
    createPostgresDriver(
      config,
      options.ClientCtor
        ? {
            ClientCtor: options.ClientCtor,
          }
        : {},
    );

  return new PostgresFactsRepository(driver);
}
