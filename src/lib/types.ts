export const MAILBOX_LIFECYCLE_STATES = [
  "healthy",
  "delayed",
  "recovery_needed",
  "recovering",
  "reauth_required",
  "disabled",
] as const;

export type MailboxLifecycleState = (typeof MAILBOX_LIFECYCLE_STATES)[number];

export interface MailboxVersions {
  subscriptionVersion: number;
  recoveryGeneration: number;
  cursorGeneration: number;
  mailboxStateVersion: number;
}

export interface DedupeWindowEntry {
  key: string;
  seenAt: string;
}

export interface MailboxCoordinatorSnapshot {
  mailboxId: string;
  lifecycleState: MailboxLifecycleState;
  versions: MailboxVersions;
  currentCursor: string | null;
  currentSubscriptionId: string | null;
  subscriptionExpiresAt: string | null;
  dedupeWindow: DedupeWindowEntry[];
  recentErrorSummary: string | null;
  delayedSince: string | null;
  lastAcceptedWebhookAt: string | null;
  stats: {
    duplicateRejectCount: number;
    staleRejectCount: number;
  };
  updatedAt: string;
}

export interface MailboxAccountFact {
  mailboxId: string;
  emailAddress: string;
  graphUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface MailboxCredentialFact {
  mailboxId: string;
  provider: "outlook";
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  updatedAt: string;
}

export interface MailboxSubscriptionFact {
  mailboxId: string;
  subscriptionId: string;
  clientState: string;
  subscriptionVersion: number;
  expirationDateTime: string | null;
  updatedAt: string;
}

export interface MailboxCursorFact {
  mailboxId: string;
  cursorGeneration: number;
  deltaToken: string | null;
  updatedAt: string;
}

export interface MessageFact {
  id: string;
  mailboxId: string;
  internetMessageId: string | null;
  subject: string;
  fromAddress: string | null;
  toAddresses: string[];
  receivedAt: string;
  preview: string;
  excerpt: string;
  bodyHtmlBlobKey: string | null;
  rawPayloadBlobKey: string | null;
  webLink: string | null;
  createdAt: string;
  updatedAt: string;
}

export type RuleMatchKind =
  | "verification_code"
  | "reward"
  | "cashback"
  | "redeem";

export type MatchConfidence = "high" | "medium";

export interface MessageRuleMatchFact {
  id: string;
  mailboxId: string;
  messageId: string;
  ruleKind: RuleMatchKind;
  confidence: MatchConfidence;
  reason: string;
  matchedText: string;
  createdAt: string;
}

export interface HitEventFact {
  id: string;
  dedupeKey: string;
  mailboxId: string;
  messageId: string;
  ruleMatchId: string;
  hitType: RuleMatchKind;
  confidence: MatchConfidence;
  processed: boolean;
  createdAt: string;
}

export interface MailboxCurrentSignalFact {
  mailboxId: string;
  signalType: RuleMatchKind;
  messageId: string;
  ruleMatchId: string;
  hitId: string;
  matchedText: string;
  confidence: MatchConfidence;
  messageReceivedAt: string;
  signalCreatedAt: string;
  updatedAt: string;
}

export interface MailboxErrorFact {
  id: string;
  mailboxId: string;
  stage: "webhook" | "fetch" | "parse" | "recover" | "renew" | "auth";
  summary: string;
  details: string | null;
  createdAt: string;
}

export interface MailboxAggregates {
  mailboxId: string;
  totalMessages: number;
  totalHits: number;
  unprocessedHits: number;
  latestMessageAt: string | null;
  latestHitAt: string | null;
}

export interface MessageDetailView {
  message: MessageFact;
  bodyHtml: string | null;
  blobMissing: boolean;
  ruleMatches: MessageRuleMatchFact[];
  hits: HitEventFact[];
}

export interface MailboxSummaryView {
  mailbox: MailboxAccountFact | null;
  state: MailboxCoordinatorSnapshot | null;
  subscription: MailboxSubscriptionFact | null;
  cursor: MailboxCursorFact | null;
  aggregates: MailboxAggregates;
}

export interface SaveParseArtifactsInput {
  matches: MessageRuleMatchFact[];
  hits: HitEventFact[];
}

export interface SaveParseArtifactsResult {
  matches: MessageRuleMatchFact[];
  hits: HitEventFact[];
  currentSignals: MailboxCurrentSignalFact[];
}

export interface CurrentSignalsQuery {
  mailboxId?: string;
  signalType?: RuleMatchKind;
  limit?: number;
}

export interface SignalHistoryQuery {
  mailboxId?: string;
  signalType?: RuleMatchKind;
  limit?: number;
}

export interface SignalHistoryEntry {
  mailboxId: string;
  messageId: string;
  ruleMatchId: string;
  hitId: string;
  signalType: RuleMatchKind;
  matchedText: string;
  confidence: MatchConfidence;
  messageReceivedAt: string;
  signalCreatedAt: string;
}

export type OtpPanelStatus =
  | "ready"
  | "waiting_for_code"
  | "delivery_path_unhealthy"
  | "empty";

export interface OtpPanelSignalView {
  mailboxId: string;
  mailboxEmailAddress: string | null;
  messageId: string;
  hitId: string;
  signalType: RuleMatchKind;
  value: string;
  confidence: MatchConfidence;
  receivedAt: string;
  createdAt: string;
}

export interface OtpPanelPrimarySignalView extends OtpPanelSignalView {
  acrossMailboxCount: number;
}

export interface OtpPanelMailboxStateView {
  mailboxId: string;
  emailAddress: string;
  lifecycleState: MailboxLifecycleState | null;
  healthy: boolean;
  snapshotMissing: boolean;
  delayedSince: string | null;
  recentErrorSummary: string | null;
}

export interface OtpPanelSummary {
  mailboxCount: number;
  healthyMailboxCount: number;
  unhealthyMailboxCount: number;
  currentVerificationCodeCount: number;
}

export interface OtpPanelResponse {
  status: OtpPanelStatus;
  primarySignal: OtpPanelPrimarySignalView | null;
  recentCodes: OtpPanelSignalView[];
  secondarySignals: OtpPanelSignalView[];
  mailboxes: OtpPanelMailboxStateView[];
  summary: OtpPanelSummary;
  generatedAt: string;
}

export interface OutlookWebhookPayload {
  value?: OutlookNotification[];
}

export interface OutlookNotification {
  subscriptionId: string;
  clientState: string;
  changeType?: string;
  lifecycleEvent?: string;
  resource?: string;
  resourceData?: {
    id?: string;
  };
  subscriptionExpirationDateTime?: string;
}

export interface RoutedWebhookNotification {
  eventId: string;
  mailboxId: string;
  subscriptionVersion: number;
  rawPayloadKey: string | null;
  notification: OutlookNotification;
}

export interface MailboxVersionStamp {
  subscriptionVersion: number;
  recoveryGeneration: number;
  cursorGeneration: number;
}

export interface MailFetchJob {
  kind: "mail.fetch";
  mailboxId: string;
  messageId: string;
  rawPayloadKey: string | null;
  source: "webhook" | "recovery";
  enqueuedAt: string;
  versions: MailboxVersionStamp;
}

export interface MailParseJob {
  kind: "mail.parse";
  mailboxId: string;
  messageId: string;
  enqueuedAt: string;
  versions: MailboxVersionStamp;
}

export interface MailRecoverJob {
  kind: "mail.recover";
  mailboxId: string;
  enqueuedAt: string;
  versions: MailboxVersionStamp;
  currentCursor: string | null;
}

export interface SubscriptionRenewJob {
  kind: "subscription.renew";
  mailboxId: string;
  enqueuedAt: string;
  versions: MailboxVersionStamp;
}

export type QueueJob =
  | MailFetchJob
  | MailParseJob
  | MailRecoverJob
  | SubscriptionRenewJob;

export interface OnboardMailboxRequest {
  mailboxId: string;
  emailAddress: string;
  graphUserId?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: string;
}

export interface ListHitsQuery {
  mailboxId?: string;
  processed?: boolean;
  hitType?: RuleMatchKind;
  limit?: number;
}

export interface OutlookGraphMessage {
  id: string;
  internetMessageId: string | null;
  subject: string;
  fromAddress: string | null;
  toAddresses: string[];
  receivedAt: string;
  bodyPreview: string;
  bodyHtml: string | null;
  webLink: string | null;
  rawPayload: unknown;
}

export interface OutlookSubscriptionResult {
  subscriptionId: string;
  expirationDateTime: string;
  clientState: string;
}

export interface OutlookDeltaResult {
  messages: OutlookGraphMessage[];
  nextCursor: string | null;
  resetCursor: boolean;
}

export interface RefreshTokenResult {
  ok: boolean;
  reauthRequired: boolean;
  accessToken: string | null;
  tokenExpiresAt: string | null;
  error: string | null;
}

export type Phase0StorageMode = "memory" | "postgres";

export interface HyperdriveBinding {
  connectionString?: string;
}

export interface Phase0Env {
  MAILBOX_COORDINATOR: DurableObjectNamespace;
  MAIL_FETCH_QUEUE: Queue<MailFetchJob>;
  MAIL_PARSE_QUEUE: Queue<MailParseJob>;
  MAIL_RECOVER_QUEUE: Queue<MailRecoverJob>;
  SUBSCRIPTION_RENEW_QUEUE: Queue<SubscriptionRenewJob>;
  MESSAGE_BLOB_BUCKET?: R2Bucket;
  PHASE0_STORAGE_MODE?: Phase0StorageMode;
  PHASE0_POSTGRES_URL?: string;
  HYPERDRIVE?: HyperdriveBinding;
  PHASE0_GRAPH_MODE?: string;
  PHASE0_AUTH_MODE?: string;
  PHASE0_DELAY_THRESHOLD_MS?: string;
  PHASE0_DEDUPE_TTL_MS?: string;
  OUTLOOK_WEBHOOK_CLIENT_STATE?: string;
  GRAPH_BASE_URL?: string;
  OUTLOOK_GRAPH_ACCESS_TOKEN?: string;
}
