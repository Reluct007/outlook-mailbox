import type {
  MailFetchJob,
  MailParseJob,
  MailRecoverJob,
  MailboxCoordinatorSnapshot,
  SubscriptionRenewJob,
} from "./types";

export function createMailFetchJob(input: {
  mailbox: MailboxCoordinatorSnapshot;
  messageId: string;
  rawPayloadKey?: string | null;
  source: MailFetchJob["source"];
  now?: string;
}): MailFetchJob {
  return {
    kind: "mail.fetch",
    mailboxId: input.mailbox.mailboxId,
    messageId: input.messageId,
    rawPayloadKey: input.rawPayloadKey ?? null,
    source: input.source,
    enqueuedAt: input.now ?? new Date().toISOString(),
    versions: {
      subscriptionVersion: input.mailbox.versions.subscriptionVersion,
      recoveryGeneration: input.mailbox.versions.recoveryGeneration,
      cursorGeneration: input.mailbox.versions.cursorGeneration,
    },
  };
}

export function createMailParseJob(input: {
  mailbox: MailboxCoordinatorSnapshot;
  messageId: string;
  now?: string;
}): MailParseJob {
  return {
    kind: "mail.parse",
    mailboxId: input.mailbox.mailboxId,
    messageId: input.messageId,
    enqueuedAt: input.now ?? new Date().toISOString(),
    versions: {
      subscriptionVersion: input.mailbox.versions.subscriptionVersion,
      recoveryGeneration: input.mailbox.versions.recoveryGeneration,
      cursorGeneration: input.mailbox.versions.cursorGeneration,
    },
  };
}

export function createMailRecoverJob(input: {
  mailbox: MailboxCoordinatorSnapshot;
  now?: string;
}): MailRecoverJob {
  return {
    kind: "mail.recover",
    mailboxId: input.mailbox.mailboxId,
    enqueuedAt: input.now ?? new Date().toISOString(),
    currentCursor: input.mailbox.currentCursor,
    versions: {
      subscriptionVersion: input.mailbox.versions.subscriptionVersion,
      recoveryGeneration: input.mailbox.versions.recoveryGeneration,
      cursorGeneration: input.mailbox.versions.cursorGeneration,
    },
  };
}

export function createSubscriptionRenewJob(input: {
  mailbox: MailboxCoordinatorSnapshot;
  now?: string;
}): SubscriptionRenewJob {
  return {
    kind: "subscription.renew",
    mailboxId: input.mailbox.mailboxId,
    enqueuedAt: input.now ?? new Date().toISOString(),
    versions: {
      subscriptionVersion: input.mailbox.versions.subscriptionVersion,
      recoveryGeneration: input.mailbox.versions.recoveryGeneration,
      cursorGeneration: input.mailbox.versions.cursorGeneration,
    },
  };
}
