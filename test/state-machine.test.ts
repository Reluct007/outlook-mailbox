import {
  advanceCursor,
  assertFreshVersions,
  createInitialMailboxSnapshot,
  recordDedupeDecision,
  startRecovery,
  transitionLifecycle,
} from "../src/lib/state-machine";

describe("mailbox state machine", () => {
  it("允许 healthy -> recovery_needed，并拒绝 reauth_required -> recovering", () => {
    const initial = createInitialMailboxSnapshot("mailbox-1");
    const recoveryNeeded = transitionLifecycle(initial, "recovery_needed");

    expect(recoveryNeeded.accepted).toBe(true);
    expect(recoveryNeeded.snapshot.lifecycleState).toBe("recovery_needed");

    const reauth = transitionLifecycle(
      recoveryNeeded.snapshot,
      "reauth_required",
    );
    const invalid = transitionLifecycle(reauth.snapshot, "recovering");

    expect(invalid.accepted).toBe(false);
    expect(invalid.reason).toBe("invalid_transition:reauth_required->recovering");
  });

  it("会拒绝 stale version", () => {
    const initial = createInitialMailboxSnapshot("mailbox-1");
    const recovering = startRecovery(initial);
    const result = assertFreshVersions(recovering.versions, {
      subscriptionVersion: recovering.versions.subscriptionVersion,
      recoveryGeneration: recovering.versions.recoveryGeneration - 1,
      cursorGeneration: recovering.versions.cursorGeneration,
    });

    expect(result.accepted).toBe(false);
    expect(result.reasons).toContain("stale_recovery_generation");
  });

  it("会做 dedupe collapse", () => {
    const initial = createInitialMailboxSnapshot("mailbox-1");
    const first = recordDedupeDecision(initial, {
      key: "event-1",
      now: "2026-04-07T00:00:00.000Z",
      ttlMs: 60_000,
    });
    const second = recordDedupeDecision(first.snapshot, {
      key: "event-1",
      now: "2026-04-07T00:00:30.000Z",
      ttlMs: 60_000,
    });

    expect(first.accepted).toBe(true);
    expect(second.accepted).toBe(false);
    expect(second.snapshot.stats.duplicateRejectCount).toBe(1);
  });

  it("只允许基于 compare-and-swap 的 cursor advance", () => {
    const initial = createInitialMailboxSnapshot("mailbox-1");
    const first = advanceCursor(initial, {
      cursorGeneration: 0,
      expectedCurrentCursor: null,
      nextCursor: "cursor-1",
    });
    const stale = advanceCursor(first.snapshot, {
      cursorGeneration: 0,
      expectedCurrentCursor: null,
      nextCursor: "cursor-older",
    });

    expect(first.accepted).toBe(true);
    expect(first.snapshot.currentCursor).toBe("cursor-1");
    expect(stale.accepted).toBe(false);
    expect(stale.reason).toBe("cursor_compare_and_swap_failed");
  });
});
