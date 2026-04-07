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
  Phase0Env,
  SaveParseArtifactsInput,
  SaveParseArtifactsResult,
  SignalHistoryEntry,
  SignalHistoryQuery,
} from "./types";
import {
  resolvePhase0StorageMode,
  resolvePostgresConnectionConfig,
} from "./postgres/config";
import { createPostgresFactsRepository } from "./postgres/repository";

interface MemoryFactsStore {
  mailboxes: Map<string, MailboxAccountFact>;
  credentials: Map<string, MailboxCredentialFact>;
  subscriptionsById: Map<string, MailboxSubscriptionFact>;
  subscriptionsByMailboxId: Map<string, MailboxSubscriptionFact>;
  cursors: Map<string, MailboxCursorFact>;
  messages: Map<string, MessageFact>;
  ruleMatchesByMessageId: Map<string, MessageRuleMatchFact[]>;
  hits: Map<string, HitEventFact>;
  currentSignals: Map<string, MailboxCurrentSignalFact>;
  errors: MailboxErrorFact[];
}

declare global {
  // eslint-disable-next-line no-var
  var __phase0FactsStore: MemoryFactsStore | undefined;
}

function getMemoryFactsStore(): MemoryFactsStore {
  globalThis.__phase0FactsStore ??= {
    mailboxes: new Map(),
    credentials: new Map(),
    subscriptionsById: new Map(),
    subscriptionsByMailboxId: new Map(),
    cursors: new Map(),
    messages: new Map(),
    ruleMatchesByMessageId: new Map(),
    hits: new Map(),
    currentSignals: new Map(),
    errors: [],
  };

  return globalThis.__phase0FactsStore;
}

function getCurrentSignalKey(signal: {
  mailboxId: string;
  signalType: string;
}): string {
  return `${signal.mailboxId}:${signal.signalType}`;
}

function compareSignalRecency(
  left: Pick<
    MailboxCurrentSignalFact | SignalHistoryEntry,
    "messageReceivedAt" | "signalCreatedAt" | "hitId"
  >,
  right: Pick<
    MailboxCurrentSignalFact | SignalHistoryEntry,
    "messageReceivedAt" | "signalCreatedAt" | "hitId"
  >,
): number {
  const receivedOrder = left.messageReceivedAt.localeCompare(right.messageReceivedAt);
  if (receivedOrder !== 0) {
    return receivedOrder;
  }

  const createdOrder = left.signalCreatedAt.localeCompare(right.signalCreatedAt);
  if (createdOrder !== 0) {
    return createdOrder;
  }

  return left.hitId.localeCompare(right.hitId);
}

function shouldReplaceCurrentSignal(
  existing: MailboxCurrentSignalFact | undefined,
  candidate: MailboxCurrentSignalFact,
): boolean {
  if (!existing) {
    return true;
  }

  return compareSignalRecency(candidate, existing) >= 0;
}

function cloneRuleMatchesMap(
  source: Map<string, MessageRuleMatchFact[]>,
): Map<string, MessageRuleMatchFact[]> {
  return new Map(
    Array.from(source.entries()).map(([messageId, matches]) => [
      messageId,
      [...matches],
    ]),
  );
}

function findHitByDedupeKey(
  hits: Iterable<HitEventFact>,
  dedupeKey: string,
): HitEventFact | undefined {
  for (const hit of hits) {
    if (hit.dedupeKey === dedupeKey) {
      return hit;
    }
  }

  return undefined;
}

function findRuleMatchById(
  ruleMatchesByMessageId: Map<string, MessageRuleMatchFact[]>,
  ruleMatchId: string,
): MessageRuleMatchFact | undefined {
  for (const matches of ruleMatchesByMessageId.values()) {
    const match = matches.find((item) => item.id === ruleMatchId);
    if (match) {
      return match;
    }
  }

  return undefined;
}

function buildCurrentSignalFact(input: {
  message: MessageFact;
  match: MessageRuleMatchFact;
  hit: HitEventFact;
  updatedAt?: string;
}): MailboxCurrentSignalFact {
  return {
    mailboxId: input.message.mailboxId,
    signalType: input.match.ruleKind,
    messageId: input.message.id,
    ruleMatchId: input.match.id,
    hitId: input.hit.id,
    matchedText: input.match.matchedText,
    confidence: input.hit.confidence,
    messageReceivedAt: input.message.receivedAt,
    signalCreatedAt: input.hit.createdAt,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };
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

export interface FactsRepository {
  upsertMailboxAccount(input: OnboardMailboxRequest): Promise<MailboxAccountFact>;
  getMailboxAccount(mailboxId: string): Promise<MailboxAccountFact | null>;
  listMailboxAccounts(): Promise<MailboxAccountFact[]>;
  upsertMailboxCredential(input: {
    mailboxId: string;
    accessToken?: string;
    refreshToken?: string;
    tokenExpiresAt?: string;
  }): Promise<MailboxCredentialFact>;
  getMailboxCredential(mailboxId: string): Promise<MailboxCredentialFact | null>;
  upsertMailboxSubscription(input: {
    mailboxId: string;
    subscriptionId: string;
    clientState: string;
    subscriptionVersion: number;
    expirationDateTime: string | null;
  }): Promise<MailboxSubscriptionFact>;
  getMailboxSubscription(mailboxId: string): Promise<MailboxSubscriptionFact | null>;
  resolveMailboxBySubscriptionId(
    subscriptionId: string,
  ): Promise<MailboxSubscriptionFact | null>;
  upsertMailboxCursor(input: {
    mailboxId: string;
    cursorGeneration: number;
    deltaToken: string | null;
  }): Promise<MailboxCursorFact>;
  getMailboxCursor(mailboxId: string): Promise<MailboxCursorFact | null>;
  saveMessage(message: MessageFact): Promise<MessageFact>;
  getMessage(messageId: string): Promise<MessageFact | null>;
  saveParseArtifacts(
    input: SaveParseArtifactsInput,
  ): Promise<SaveParseArtifactsResult>;
  listCurrentSignals(query: CurrentSignalsQuery): Promise<MailboxCurrentSignalFact[]>;
  listSignalHistory(query: SignalHistoryQuery): Promise<SignalHistoryEntry[]>;
  listHits(query: ListHitsQuery): Promise<HitEventFact[]>;
  getMessageDetail(messageId: string): Promise<MessageDetailView | null>;
  getMailboxAggregates(mailboxId: string): Promise<MailboxAggregates>;
  saveMailboxError(error: MailboxErrorFact): Promise<void>;
}

class MemoryFactsRepository implements FactsRepository {
  async upsertMailboxAccount(
    input: OnboardMailboxRequest,
  ): Promise<MailboxAccountFact> {
    const now = new Date().toISOString();
    const store = getMemoryFactsStore();
    const existing = store.mailboxes.get(input.mailboxId);
    const nextValue: MailboxAccountFact = {
      mailboxId: input.mailboxId,
      emailAddress: input.emailAddress,
      graphUserId: input.graphUserId ?? input.emailAddress,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    store.mailboxes.set(nextValue.mailboxId, nextValue);
    return nextValue;
  }

  async getMailboxAccount(mailboxId: string): Promise<MailboxAccountFact | null> {
    return getMemoryFactsStore().mailboxes.get(mailboxId) ?? null;
  }

  async listMailboxAccounts(): Promise<MailboxAccountFact[]> {
    return Array.from(getMemoryFactsStore().mailboxes.values()).sort(
      (left, right) => left.mailboxId.localeCompare(right.mailboxId),
    );
  }

  async upsertMailboxCredential(input: {
    mailboxId: string;
    accessToken?: string;
    refreshToken?: string;
    tokenExpiresAt?: string;
  }): Promise<MailboxCredentialFact> {
    const store = getMemoryFactsStore();
    const existing = store.credentials.get(input.mailboxId);
    const now = new Date().toISOString();
    const nextValue: MailboxCredentialFact = {
      mailboxId: input.mailboxId,
      provider: "outlook",
      accessToken: input.accessToken ?? existing?.accessToken ?? null,
      refreshToken: input.refreshToken ?? existing?.refreshToken ?? null,
      tokenExpiresAt: input.tokenExpiresAt ?? existing?.tokenExpiresAt ?? null,
      updatedAt: now,
    };

    store.credentials.set(input.mailboxId, nextValue);
    return nextValue;
  }

  async getMailboxCredential(
    mailboxId: string,
  ): Promise<MailboxCredentialFact | null> {
    return getMemoryFactsStore().credentials.get(mailboxId) ?? null;
  }

  async upsertMailboxSubscription(input: {
    mailboxId: string;
    subscriptionId: string;
    clientState: string;
    subscriptionVersion: number;
    expirationDateTime: string | null;
  }): Promise<MailboxSubscriptionFact> {
    const store = getMemoryFactsStore();
    const nextValue: MailboxSubscriptionFact = {
      mailboxId: input.mailboxId,
      subscriptionId: input.subscriptionId,
      clientState: input.clientState,
      subscriptionVersion: input.subscriptionVersion,
      expirationDateTime: input.expirationDateTime,
      updatedAt: new Date().toISOString(),
    };

    store.subscriptionsById.set(input.subscriptionId, nextValue);
    store.subscriptionsByMailboxId.set(input.mailboxId, nextValue);
    return nextValue;
  }

  async getMailboxSubscription(
    mailboxId: string,
  ): Promise<MailboxSubscriptionFact | null> {
    return getMemoryFactsStore().subscriptionsByMailboxId.get(mailboxId) ?? null;
  }

  async resolveMailboxBySubscriptionId(
    subscriptionId: string,
  ): Promise<MailboxSubscriptionFact | null> {
    return getMemoryFactsStore().subscriptionsById.get(subscriptionId) ?? null;
  }

  async upsertMailboxCursor(input: {
    mailboxId: string;
    cursorGeneration: number;
    deltaToken: string | null;
  }): Promise<MailboxCursorFact> {
    const nextValue: MailboxCursorFact = {
      mailboxId: input.mailboxId,
      cursorGeneration: input.cursorGeneration,
      deltaToken: input.deltaToken,
      updatedAt: new Date().toISOString(),
    };

    getMemoryFactsStore().cursors.set(input.mailboxId, nextValue);
    return nextValue;
  }

  async getMailboxCursor(mailboxId: string): Promise<MailboxCursorFact | null> {
    return getMemoryFactsStore().cursors.get(mailboxId) ?? null;
  }

  async saveMessage(message: MessageFact): Promise<MessageFact> {
    getMemoryFactsStore().messages.set(message.id, message);
    return message;
  }

  async getMessage(messageId: string): Promise<MessageFact | null> {
    return getMemoryFactsStore().messages.get(messageId) ?? null;
  }

  async saveParseArtifacts(
    input: SaveParseArtifactsInput,
  ): Promise<SaveParseArtifactsResult> {
    validateParseArtifacts(input);

    const store = getMemoryFactsStore();
    const messageId = getArtifactsMessageId(input);

    if (!messageId) {
      return {
        matches: [],
        hits: [],
        currentSignals: [],
      };
    }

    const message = store.messages.get(messageId);
    if (!message) {
      throw new Error(`message_not_found:${messageId}`);
    }

    const nextRuleMatchesByMessageId = cloneRuleMatchesMap(store.ruleMatchesByMessageId);
    const nextHits = new Map(store.hits);
    const nextCurrentSignals = new Map(store.currentSignals);

    const mergedMatches = new Map<string, MessageRuleMatchFact>();
    for (const match of nextRuleMatchesByMessageId.get(messageId) ?? []) {
      mergedMatches.set(match.id, match);
    }
    for (const match of input.matches) {
      mergedMatches.set(match.id, match);
    }
    nextRuleMatchesByMessageId.set(messageId, Array.from(mergedMatches.values()));

    const resolvedHits: HitEventFact[] = [];
    for (const hit of input.hits) {
      const existing = findHitByDedupeKey(nextHits.values(), hit.dedupeKey);
      if (existing) {
        resolvedHits.push(existing);
        continue;
      }

      nextHits.set(hit.id, hit);
      resolvedHits.push(hit);
    }

    const currentSignals: MailboxCurrentSignalFact[] = [];
    for (const hit of resolvedHits) {
      const match =
        mergedMatches.get(hit.ruleMatchId) ??
        findRuleMatchById(nextRuleMatchesByMessageId, hit.ruleMatchId);
      if (!match) {
        throw new Error(`rule_match_not_found:${hit.ruleMatchId}`);
      }

      const candidate = buildCurrentSignalFact({
        message,
        match,
        hit,
      });
      const key = getCurrentSignalKey(candidate);
      const existing = nextCurrentSignals.get(key);
      if (shouldReplaceCurrentSignal(existing, candidate)) {
        nextCurrentSignals.set(key, candidate);
      }

      const currentSignal = nextCurrentSignals.get(key);
      if (!currentSignal) {
        throw new Error(`current_signal_resolution_failed:${key}`);
      }
      currentSignals.push(currentSignal);
    }

    store.ruleMatchesByMessageId = nextRuleMatchesByMessageId;
    store.hits = nextHits;
    store.currentSignals = nextCurrentSignals;

    return {
      matches: nextRuleMatchesByMessageId.get(messageId) ?? [],
      hits: resolvedHits,
      currentSignals,
    };
  }

  async listCurrentSignals(
    query: CurrentSignalsQuery,
  ): Promise<MailboxCurrentSignalFact[]> {
    let values = Array.from(getMemoryFactsStore().currentSignals.values());

    if (query.mailboxId) {
      values = values.filter((signal) => signal.mailboxId === query.mailboxId);
    }

    if (query.signalType) {
      values = values.filter((signal) => signal.signalType === query.signalType);
    }

    const limit = query.limit ?? 100;
    return values
      .sort((left, right) => compareSignalRecency(right, left))
      .slice(0, limit);
  }

  async listSignalHistory(
    query: SignalHistoryQuery,
  ): Promise<SignalHistoryEntry[]> {
    const store = getMemoryFactsStore();
    let values = Array.from(store.hits.values())
      .map<SignalHistoryEntry | null>((hit) => {
        const message = store.messages.get(hit.messageId);
        const match = findRuleMatchById(store.ruleMatchesByMessageId, hit.ruleMatchId);
        if (!message || !match) {
          return null;
        }

        return {
          mailboxId: hit.mailboxId,
          messageId: hit.messageId,
          ruleMatchId: hit.ruleMatchId,
          hitId: hit.id,
          signalType: hit.hitType,
          matchedText: match.matchedText,
          confidence: hit.confidence,
          messageReceivedAt: message.receivedAt,
          signalCreatedAt: hit.createdAt,
        };
      })
      .filter((entry): entry is SignalHistoryEntry => entry !== null);

    if (query.mailboxId) {
      values = values.filter((entry) => entry.mailboxId === query.mailboxId);
    }

    if (query.signalType) {
      values = values.filter((entry) => entry.signalType === query.signalType);
    }

    const limit = query.limit ?? 50;
    return values
      .sort((left, right) => compareSignalRecency(right, left))
      .slice(0, limit);
  }

  async listHits(query: ListHitsQuery): Promise<HitEventFact[]> {
    let values = Array.from(getMemoryFactsStore().hits.values());

    if (query.mailboxId) {
      values = values.filter((hit) => hit.mailboxId === query.mailboxId);
    }

    if (query.processed !== undefined) {
      values = values.filter((hit) => hit.processed === query.processed);
    }

    if (query.hitType) {
      values = values.filter((hit) => hit.hitType === query.hitType);
    }

    const limit = query.limit ?? 50;
    return values
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit);
  }

  async getMessageDetail(messageId: string): Promise<MessageDetailView | null> {
    const message = getMemoryFactsStore().messages.get(messageId);
    if (!message) {
      return null;
    }

    const ruleMatches =
      getMemoryFactsStore().ruleMatchesByMessageId.get(messageId) ?? [];
    const hits = Array.from(getMemoryFactsStore().hits.values()).filter(
      (hit) => hit.messageId === messageId,
    );

    return {
      message,
      bodyHtml: null,
      blobMissing: false,
      ruleMatches,
      hits,
    };
  }

  async getMailboxAggregates(mailboxId: string): Promise<MailboxAggregates> {
    const store = getMemoryFactsStore();
    const messages = Array.from(store.messages.values()).filter(
      (message) => message.mailboxId === mailboxId,
    );
    const hits = Array.from(store.hits.values()).filter(
      (hit) => hit.mailboxId === mailboxId,
    );

    return {
      mailboxId,
      totalMessages: messages.length,
      totalHits: hits.length,
      unprocessedHits: hits.filter((hit) => !hit.processed).length,
      latestMessageAt:
        messages
          .map((message) => message.receivedAt)
          .sort((left, right) => right.localeCompare(left))[0] ?? null,
      latestHitAt:
        hits
          .map((hit) => hit.createdAt)
          .sort((left, right) => right.localeCompare(left))[0] ?? null,
    };
  }

  async saveMailboxError(error: MailboxErrorFact): Promise<void> {
    getMemoryFactsStore().errors.push(error);
  }
}

export function createFactsRepository(env: Phase0Env): FactsRepository {
  const mode = resolvePhase0StorageMode(env);

  if (mode === "postgres") {
    return createPostgresFactsRepository(resolvePostgresConnectionConfig(env)!);
  }

  if (mode === "memory") {
    return new MemoryFactsRepository();
  }

  const unsupported: never = mode;
  throw new Error(`unsupported_storage_mode:${String(unsupported)}`);
}

export function resetMemoryFactsRepository(): void {
  const store = getMemoryFactsStore();
  store.mailboxes.clear();
  store.credentials.clear();
  store.subscriptionsById.clear();
  store.subscriptionsByMailboxId.clear();
  store.cursors.clear();
  store.messages.clear();
  store.ruleMatchesByMessageId.clear();
  store.hits.clear();
  store.currentSignals.clear();
  store.errors.length = 0;
}
