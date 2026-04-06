import type {
  MailboxCoordinatorSnapshot,
  MailboxLifecycleState,
  MailboxVersions,
} from "./types";

const ALLOWED_TRANSITIONS: Record<
  MailboxLifecycleState,
  readonly MailboxLifecycleState[]
> = {
  healthy: [
    "healthy",
    "delayed",
    "recovery_needed",
    "reauth_required",
    "disabled",
  ],
  delayed: [
    "healthy",
    "delayed",
    "recovery_needed",
    "reauth_required",
    "disabled",
  ],
  recovery_needed: [
    "recovery_needed",
    "recovering",
    "reauth_required",
    "disabled",
  ],
  recovering: [
    "healthy",
    "delayed",
    "recovering",
    "recovery_needed",
    "reauth_required",
    "disabled",
  ],
  reauth_required: ["healthy", "reauth_required", "disabled"],
  disabled: ["disabled"],
};

export function createInitialVersions(): MailboxVersions {
  return {
    subscriptionVersion: 0,
    recoveryGeneration: 0,
    cursorGeneration: 0,
    mailboxStateVersion: 0,
  };
}

export function createInitialMailboxSnapshot(
  mailboxId: string,
  now = new Date().toISOString(),
): MailboxCoordinatorSnapshot {
  return {
    mailboxId,
    lifecycleState: "healthy",
    versions: createInitialVersions(),
    currentCursor: null,
    currentSubscriptionId: null,
    subscriptionExpiresAt: null,
    dedupeWindow: [],
    recentErrorSummary: null,
    delayedSince: null,
    lastAcceptedWebhookAt: null,
    stats: {
      duplicateRejectCount: 0,
      staleRejectCount: 0,
    },
    updatedAt: now,
  };
}

export function transitionLifecycle(
  snapshot: MailboxCoordinatorSnapshot,
  nextState: MailboxLifecycleState,
  input: {
    now?: string;
    errorSummary?: string | null;
  } = {},
): {
  accepted: boolean;
  reason?: string;
  snapshot: MailboxCoordinatorSnapshot;
} {
  if (!ALLOWED_TRANSITIONS[snapshot.lifecycleState].includes(nextState)) {
    return {
      accepted: false,
      reason: `invalid_transition:${snapshot.lifecycleState}->${nextState}`,
      snapshot,
    };
  }

  const now = input.now ?? new Date().toISOString();
  const changed = snapshot.lifecycleState !== nextState;
  const nextSnapshot: MailboxCoordinatorSnapshot = {
    ...snapshot,
    lifecycleState: nextState,
    recentErrorSummary:
      input.errorSummary === undefined
        ? snapshot.recentErrorSummary
        : input.errorSummary,
    delayedSince:
      nextState === "delayed"
        ? snapshot.delayedSince ?? now
        : nextState === snapshot.lifecycleState
          ? snapshot.delayedSince
          : null,
    updatedAt: now,
    versions: changed
      ? {
          ...snapshot.versions,
          mailboxStateVersion: snapshot.versions.mailboxStateVersion + 1,
        }
      : snapshot.versions,
  };

  return {
    accepted: true,
    snapshot: nextSnapshot,
  };
}

export function nextSubscriptionVersion(
  snapshot: MailboxCoordinatorSnapshot,
  now = new Date().toISOString(),
): MailboxCoordinatorSnapshot {
  return {
    ...snapshot,
    versions: {
      ...snapshot.versions,
      subscriptionVersion: snapshot.versions.subscriptionVersion + 1,
    },
    updatedAt: now,
  };
}

export function markRecoveryNeeded(
  snapshot: MailboxCoordinatorSnapshot,
  input: { now?: string; errorSummary?: string | null } = {},
): MailboxCoordinatorSnapshot {
  return transitionLifecycle(snapshot, "recovery_needed", input).snapshot;
}

export function startRecovery(
  snapshot: MailboxCoordinatorSnapshot,
  input: { now?: string; errorSummary?: string | null } = {},
): MailboxCoordinatorSnapshot {
  const base = transitionLifecycle(snapshot, "recovering", input).snapshot;

  return {
    ...base,
    versions: {
      ...base.versions,
      recoveryGeneration: base.versions.recoveryGeneration + 1,
      cursorGeneration: base.versions.cursorGeneration + 1,
    },
  };
}

export function recordAcceptedWebhook(
  snapshot: MailboxCoordinatorSnapshot,
  now = new Date().toISOString(),
): MailboxCoordinatorSnapshot {
  return {
    ...snapshot,
    lastAcceptedWebhookAt: now,
    updatedAt: now,
  };
}

export function recordDedupeDecision(
  snapshot: MailboxCoordinatorSnapshot,
  input: {
    key: string;
    now?: string;
    ttlMs?: number;
  },
): {
  accepted: boolean;
  snapshot: MailboxCoordinatorSnapshot;
} {
  const now = input.now ?? new Date().toISOString();
  const ttlMs = input.ttlMs ?? 10 * 60 * 1000;
  const cutoff = new Date(new Date(now).getTime() - ttlMs).toISOString();
  const pruned = snapshot.dedupeWindow.filter((entry) => entry.seenAt >= cutoff);
  const duplicate = pruned.some((entry) => entry.key === input.key);

  if (duplicate) {
    return {
      accepted: false,
      snapshot: {
        ...snapshot,
        dedupeWindow: pruned,
        stats: {
          ...snapshot.stats,
          duplicateRejectCount: snapshot.stats.duplicateRejectCount + 1,
        },
        updatedAt: now,
      },
    };
  }

  return {
    accepted: true,
    snapshot: {
      ...snapshot,
      dedupeWindow: [...pruned, { key: input.key, seenAt: now }],
      updatedAt: now,
    },
  };
}

export function assertFreshVersions(
  current: MailboxVersions,
  candidate: Partial<MailboxVersions>,
): {
  accepted: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];

  if (
    candidate.subscriptionVersion !== undefined &&
    candidate.subscriptionVersion < current.subscriptionVersion
  ) {
    reasons.push("stale_subscription_version");
  }

  if (
    candidate.recoveryGeneration !== undefined &&
    candidate.recoveryGeneration < current.recoveryGeneration
  ) {
    reasons.push("stale_recovery_generation");
  }

  if (
    candidate.cursorGeneration !== undefined &&
    candidate.cursorGeneration < current.cursorGeneration
  ) {
    reasons.push("stale_cursor_generation");
  }

  if (
    candidate.mailboxStateVersion !== undefined &&
    candidate.mailboxStateVersion < current.mailboxStateVersion
  ) {
    reasons.push("stale_mailbox_state_version");
  }

  return {
    accepted: reasons.length === 0,
    reasons,
  };
}

export function recordStaleReject(
  snapshot: MailboxCoordinatorSnapshot,
  now = new Date().toISOString(),
): MailboxCoordinatorSnapshot {
  return {
    ...snapshot,
    stats: {
      ...snapshot.stats,
      staleRejectCount: snapshot.stats.staleRejectCount + 1,
    },
    updatedAt: now,
  };
}

export function advanceCursor(
  snapshot: MailboxCoordinatorSnapshot,
  input: {
    cursorGeneration: number;
    expectedCurrentCursor: string | null;
    nextCursor: string | null;
    reset?: boolean;
    now?: string;
  },
): {
  accepted: boolean;
  reason?: string;
  snapshot: MailboxCoordinatorSnapshot;
} {
  const now = input.now ?? new Date().toISOString();

  if (input.cursorGeneration < snapshot.versions.cursorGeneration) {
    return {
      accepted: false,
      reason: "stale_cursor_generation",
      snapshot,
    };
  }

  if (
    !input.reset &&
    snapshot.currentCursor !== input.expectedCurrentCursor
  ) {
    return {
      accepted: false,
      reason: "cursor_compare_and_swap_failed",
      snapshot,
    };
  }

  return {
    accepted: true,
    snapshot: {
      ...snapshot,
      currentCursor: input.nextCursor,
      updatedAt: now,
      versions:
        input.cursorGeneration === snapshot.versions.cursorGeneration
          ? snapshot.versions
          : {
              ...snapshot.versions,
              cursorGeneration: input.cursorGeneration,
            },
    },
  };
}
