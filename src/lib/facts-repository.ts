import type {
  HitEventFact,
  ListHitsQuery,
  MailboxAccountFact,
  MailboxAggregates,
  MailboxCredentialFact,
  MailboxCursorFact,
  MailboxErrorFact,
  MailboxSubscriptionFact,
  MessageDetailView,
  MessageFact,
  MessageRuleMatchFact,
  OnboardMailboxRequest,
  Phase0Env,
} from "./types";

interface MemoryFactsStore {
  mailboxes: Map<string, MailboxAccountFact>;
  credentials: Map<string, MailboxCredentialFact>;
  subscriptionsById: Map<string, MailboxSubscriptionFact>;
  subscriptionsByMailboxId: Map<string, MailboxSubscriptionFact>;
  cursors: Map<string, MailboxCursorFact>;
  messages: Map<string, MessageFact>;
  ruleMatchesByMessageId: Map<string, MessageRuleMatchFact[]>;
  hits: Map<string, HitEventFact>;
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
    errors: [],
  };

  return globalThis.__phase0FactsStore;
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
  saveRuleMatches(
    matches: MessageRuleMatchFact[],
  ): Promise<MessageRuleMatchFact[]>;
  saveHitEvents(hits: HitEventFact[]): Promise<HitEventFact[]>;
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
    return Array.from(getMemoryFactsStore().mailboxes.values()).sort((left, right) =>
      left.mailboxId.localeCompare(right.mailboxId),
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

  async saveRuleMatches(
    matches: MessageRuleMatchFact[],
  ): Promise<MessageRuleMatchFact[]> {
    const store = getMemoryFactsStore();
    if (matches.length === 0) {
      return matches;
    }

    const firstMatch = matches[0];
    if (!firstMatch) {
      return matches;
    }

    const messageId = firstMatch.messageId;
    const merged = new Map<string, MessageRuleMatchFact>();
    const existing = store.ruleMatchesByMessageId.get(messageId) ?? [];

    for (const match of existing) {
      merged.set(match.id, match);
    }

    for (const match of matches) {
      merged.set(match.id, match);
    }

    const nextValues = Array.from(merged.values());
    store.ruleMatchesByMessageId.set(messageId, nextValues);
    return nextValues;
  }

  async saveHitEvents(hits: HitEventFact[]): Promise<HitEventFact[]> {
    const store = getMemoryFactsStore();
    const inserted: HitEventFact[] = [];

    for (const hit of hits) {
      const existing = Array.from(store.hits.values()).find(
        (item) => item.dedupeKey === hit.dedupeKey,
      );
      if (existing) {
        inserted.push(existing);
        continue;
      }

      store.hits.set(hit.id, hit);
      inserted.push(hit);
    }

    return inserted;
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
      latestMessageAt: messages
        .map((message) => message.receivedAt)
        .sort((left, right) => right.localeCompare(left))[0] ?? null,
      latestHitAt: hits
        .map((hit) => hit.createdAt)
        .sort((left, right) => right.localeCompare(left))[0] ?? null,
    };
  }

  async saveMailboxError(error: MailboxErrorFact): Promise<void> {
    getMemoryFactsStore().errors.push(error);
  }
}

export function createFactsRepository(env: Phase0Env): FactsRepository {
  const mode = env.PHASE0_STORAGE_MODE ?? "memory";

  if (mode === "postgres") {
    throw new Error(
      "postgres facts repository is not wired yet; use memory mode for Phase 0 local validation",
    );
  }

  return new MemoryFactsRepository();
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
  store.errors.length = 0;
}
