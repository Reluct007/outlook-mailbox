import type {
  MailboxAccountFact,
  MailboxCoordinatorSnapshot,
  MailboxCurrentSignalFact,
  OtpPanelMailboxStateView,
  OtpPanelPrimarySignalView,
  OtpPanelResponse,
  OtpPanelSignalView,
  SignalHistoryEntry,
} from "./types";

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
  const receivedOrder = right.messageReceivedAt.localeCompare(left.messageReceivedAt);
  if (receivedOrder !== 0) {
    return receivedOrder;
  }

  const createdOrder = right.signalCreatedAt.localeCompare(left.signalCreatedAt);
  if (createdOrder !== 0) {
    return createdOrder;
  }

  return right.hitId.localeCompare(left.hitId);
}

function isMailboxHealthy(snapshot: MailboxCoordinatorSnapshot | null): boolean {
  return snapshot?.lifecycleState === "healthy";
}

function mapMailboxState(input: {
  mailbox: MailboxAccountFact;
  snapshot: MailboxCoordinatorSnapshot | null;
}): OtpPanelMailboxStateView {
  return {
    mailboxId: input.mailbox.mailboxId,
    emailAddress: input.mailbox.emailAddress,
    lifecycleState: input.snapshot?.lifecycleState ?? null,
    healthy: isMailboxHealthy(input.snapshot),
    snapshotMissing: input.snapshot === null,
    delayedSince: input.snapshot?.delayedSince ?? null,
    recentErrorSummary: input.snapshot?.recentErrorSummary ?? null,
  };
}

function mapSignalView(
  signal: MailboxCurrentSignalFact | SignalHistoryEntry,
  mailboxesById: Map<string, MailboxAccountFact>,
): OtpPanelSignalView {
  return {
    mailboxId: signal.mailboxId,
    mailboxEmailAddress: mailboxesById.get(signal.mailboxId)?.emailAddress ?? null,
    messageId: signal.messageId,
    hitId: signal.hitId,
    signalType: signal.signalType,
    value: signal.matchedText,
    confidence: signal.confidence,
    receivedAt: signal.messageReceivedAt,
    createdAt: signal.signalCreatedAt,
  };
}

export function buildOtpPanelResponse(input: {
  mailboxes: MailboxAccountFact[];
  snapshotsByMailboxId: Map<string, MailboxCoordinatorSnapshot | null>;
  currentSignals: MailboxCurrentSignalFact[];
  recentSignalHistory: SignalHistoryEntry[];
  now?: string;
}): OtpPanelResponse {
  const now = input.now ?? new Date().toISOString();
  const mailboxesById = new Map(
    input.mailboxes.map((mailbox) => [mailbox.mailboxId, mailbox]),
  );

  const mailboxStates = input.mailboxes
    .map((mailbox) =>
      mapMailboxState({
        mailbox,
        snapshot: input.snapshotsByMailboxId.get(mailbox.mailboxId) ?? null,
      }),
    )
    .sort((left, right) => left.mailboxId.localeCompare(right.mailboxId));

  const verificationSignals = input.currentSignals
    .filter((signal) => signal.signalType === "verification_code")
    .sort(compareSignalRecency);
  const secondarySignals = input.currentSignals
    .filter((signal) => signal.signalType !== "verification_code")
    .sort(compareSignalRecency)
    .map((signal) => mapSignalView(signal, mailboxesById));

  const primarySignalBase = verificationSignals[0];
  const primarySignal: OtpPanelPrimarySignalView | null = primarySignalBase
    ? {
        ...mapSignalView(primarySignalBase, mailboxesById),
        acrossMailboxCount: verificationSignals.length,
      }
    : null;

  const recentCodes = input.recentSignalHistory
    .filter((entry) => entry.signalType === "verification_code")
    .sort(compareSignalRecency)
    .filter((entry) => entry.hitId !== primarySignalBase?.hitId)
    .map((entry) => mapSignalView(entry, mailboxesById));

  const unhealthyMailboxCount = mailboxStates.filter((mailbox) => !mailbox.healthy).length;
  const healthyMailboxCount = mailboxStates.length - unhealthyMailboxCount;

  let status: OtpPanelResponse["status"];
  if (primarySignal) {
    status = "ready";
  } else if (mailboxStates.length === 0) {
    status = "empty";
  } else if (unhealthyMailboxCount > 0) {
    status = "delivery_path_unhealthy";
  } else {
    status = "waiting_for_code";
  }

  return {
    status,
    primarySignal,
    recentCodes,
    secondarySignals,
    mailboxes: mailboxStates,
    summary: {
      mailboxCount: mailboxStates.length,
      healthyMailboxCount,
      unhealthyMailboxCount,
      currentVerificationCodeCount: verificationSignals.length,
    },
    generatedAt: now,
  };
}
