import {
  createMailFetchJob,
  createMailRecoverJob,
  createSubscriptionRenewJob,
} from "../lib/queue-contracts";
import {
  advanceCursor,
  assertFreshVersions,
  createInitialMailboxSnapshot,
  markRecoveryNeeded,
  nextSubscriptionVersion,
  recordAcceptedWebhook,
  recordDedupeDecision,
  recordStaleReject,
  startRecovery,
  transitionLifecycle,
} from "../lib/state-machine";
import { badRequest, json, methodNotAllowed, notFound } from "../lib/http";
import type {
  MailboxCoordinatorSnapshot,
  Phase0Env,
  RoutedWebhookNotification,
} from "../lib/types";

const SNAPSHOT_KEY = "snapshot";

function parseDelayThresholdMs(env: Phase0Env): number {
  return Number.parseInt(env.PHASE0_DELAY_THRESHOLD_MS ?? "300000", 10);
}

async function loadSnapshot(
  state: DurableObjectState,
): Promise<MailboxCoordinatorSnapshot | null> {
  return (await state.storage.get<MailboxCoordinatorSnapshot>(SNAPSHOT_KEY)) ?? null;
}

async function saveSnapshot(
  state: DurableObjectState,
  snapshot: MailboxCoordinatorSnapshot,
): Promise<void> {
  await state.storage.put(SNAPSHOT_KEY, snapshot);
}

export class MailboxCoordinator {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Phase0Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/snapshot") {
      if (request.method !== "GET") {
        return methodNotAllowed(["GET"]);
      }

      const snapshot = await loadSnapshot(this.state);
      return snapshot ? json(snapshot) : notFound("mailbox_not_initialized");
    }

    if (url.pathname === "/commands/onboard") {
      if (request.method !== "POST") {
        return methodNotAllowed(["POST"]);
      }

      const body = (await request.json()) as { mailboxId?: string };
      if (!body.mailboxId) {
        return badRequest("mailboxId is required");
      }

      const existing = await loadSnapshot(this.state);
      let snapshot =
        existing ?? createInitialMailboxSnapshot(body.mailboxId);
      snapshot = nextSubscriptionVersion(snapshot);
      await saveSnapshot(this.state, snapshot);
      await this.env.SUBSCRIPTION_RENEW_QUEUE.send(
        createSubscriptionRenewJob({ mailbox: snapshot }),
      );

      return json(snapshot, { status: 201 });
    }

    if (url.pathname === "/webhooks/outlook") {
      if (request.method !== "POST") {
        return methodNotAllowed(["POST"]);
      }

      const body = (await request.json()) as {
        mailboxId?: string;
        events?: RoutedWebhookNotification[];
      };

      if (!body.mailboxId || !body.events) {
        return badRequest("mailboxId and events are required");
      }

      let snapshot = await loadSnapshot(this.state);
      if (!snapshot) {
        return notFound("mailbox_not_initialized");
      }

      const results: Array<{ eventId: string; status: string }> = [];
      const dedupeTtlMs = Number.parseInt(
        this.env.PHASE0_DEDUPE_TTL_MS ?? "600000",
        10,
      );

      for (const event of body.events) {
        const versionCheck = assertFreshVersions(snapshot.versions, {
          subscriptionVersion: event.subscriptionVersion,
        });

        if (!versionCheck.accepted) {
          snapshot = recordStaleReject(snapshot);
          results.push({
            eventId: event.eventId,
            status: versionCheck.reasons.join(","),
          });
          continue;
        }

        const dedupeDecision = recordDedupeDecision(snapshot, {
          key: event.eventId,
          ttlMs: dedupeTtlMs,
        });
        snapshot = dedupeDecision.snapshot;

        if (!dedupeDecision.accepted) {
          results.push({
            eventId: event.eventId,
            status: "duplicate",
          });
          continue;
        }

        snapshot = recordAcceptedWebhook(snapshot);
        const lifecycleEvent = event.notification.lifecycleEvent?.toLowerCase();

        if (lifecycleEvent === "reauthorizationrequired") {
          snapshot = transitionLifecycle(snapshot, "reauth_required", {
            errorSummary: "graph lifecycle event requested reauthorization",
          }).snapshot;
          results.push({
            eventId: event.eventId,
            status: "reauth_required",
          });
          continue;
        }

        if (
          lifecycleEvent === "missed" ||
          lifecycleEvent === "subscriptionremoved"
        ) {
          snapshot = markRecoveryNeeded(snapshot, {
            errorSummary: `graph lifecycle event:${lifecycleEvent}`,
          });
          results.push({
            eventId: event.eventId,
            status: "recovery_needed",
          });
          continue;
        }

        const messageId = event.notification.resourceData?.id;
        if (!messageId) {
          results.push({
            eventId: event.eventId,
            status: "ignored_without_message_id",
          });
          continue;
        }

        await this.env.MAIL_FETCH_QUEUE.send(
          createMailFetchJob({
            mailbox: snapshot,
            messageId,
            rawPayloadKey: event.rawPayloadKey,
            source: "webhook",
          }),
        );
        results.push({
          eventId: event.eventId,
          status: "fetch_queued",
        });
      }

      await saveSnapshot(this.state, snapshot);
      return json({
        mailboxId: body.mailboxId,
        results,
        snapshot,
      });
    }

    if (url.pathname === "/commands/start-recovery") {
      if (request.method !== "POST") {
        return methodNotAllowed(["POST"]);
      }

      const body = (await request.json()) as { mailboxId?: string; reason?: string };
      if (!body.mailboxId) {
        return badRequest("mailboxId is required");
      }

      const snapshot = await loadSnapshot(this.state);
      if (!snapshot) {
        return notFound("mailbox_not_initialized");
      }

      const nextSnapshot = startRecovery(snapshot, {
        errorSummary: body.reason ?? "manual recovery",
      });
      await saveSnapshot(this.state, nextSnapshot);
      await this.env.MAIL_RECOVER_QUEUE.send(
        createMailRecoverJob({ mailbox: nextSnapshot }),
      );

      return json(nextSnapshot, { status: 202 });
    }

    if (url.pathname === "/jobs/recovery-finished") {
      if (request.method !== "POST") {
        return methodNotAllowed(["POST"]);
      }

      const body = (await request.json()) as {
        recoveryGeneration?: number;
        cursorGeneration?: number;
        expectedCurrentCursor?: string | null;
        nextCursor?: string | null;
        resetCursor?: boolean;
      };

      let snapshot = await loadSnapshot(this.state);
      if (!snapshot) {
        return notFound("mailbox_not_initialized");
      }

      const versionCheck = assertFreshVersions(
        snapshot.versions,
        body.recoveryGeneration === undefined
          ? {}
          : {
              recoveryGeneration: body.recoveryGeneration,
            },
      );

      if (!versionCheck.accepted) {
        snapshot = recordStaleReject(snapshot);
        await saveSnapshot(this.state, snapshot);
        return json(
          {
            accepted: false,
            reasons: versionCheck.reasons,
            snapshot,
          },
          { status: 409 },
        );
      }

      if (body.cursorGeneration !== undefined) {
        const cursorUpdate = advanceCursor(snapshot, {
          cursorGeneration: body.cursorGeneration,
          expectedCurrentCursor: body.expectedCurrentCursor ?? null,
          nextCursor: body.nextCursor ?? null,
          reset: body.resetCursor ?? false,
        });

        if (!cursorUpdate.accepted) {
          return json(
            {
              accepted: false,
              reason: cursorUpdate.reason,
              snapshot,
            },
            { status: 409 },
          );
        }

        snapshot = cursorUpdate.snapshot;
      }

      snapshot = transitionLifecycle(snapshot, "healthy", {
        errorSummary: null,
      }).snapshot;
      await saveSnapshot(this.state, snapshot);

      return json({
        accepted: true,
        snapshot,
      });
    }

    if (url.pathname === "/jobs/fetch-finished") {
      if (request.method !== "POST") {
        return methodNotAllowed(["POST"]);
      }

      const body = (await request.json()) as { queueLagMs?: number };
      let snapshot = await loadSnapshot(this.state);
      if (!snapshot) {
        return notFound("mailbox_not_initialized");
      }

      if ((body.queueLagMs ?? 0) >= parseDelayThresholdMs(this.env)) {
        snapshot = transitionLifecycle(snapshot, "delayed", {
          errorSummary: `queue backlog age ${body.queueLagMs}ms exceeded threshold`,
        }).snapshot;
      } else if (snapshot.lifecycleState === "delayed") {
        snapshot = transitionLifecycle(snapshot, "healthy", {
          errorSummary: null,
        }).snapshot;
      }

      await saveSnapshot(this.state, snapshot);
      return json(snapshot);
    }

    if (url.pathname === "/jobs/auth-failed") {
      if (request.method !== "POST") {
        return methodNotAllowed(["POST"]);
      }

      const body = (await request.json()) as {
        reauthRequired?: boolean;
        errorSummary?: string | null;
      };

      let snapshot = await loadSnapshot(this.state);
      if (!snapshot) {
        return notFound("mailbox_not_initialized");
      }

      snapshot = transitionLifecycle(
        snapshot,
        body.reauthRequired ? "reauth_required" : "delayed",
        {
          errorSummary: body.errorSummary ?? "auth failed",
        },
      ).snapshot;

      await saveSnapshot(this.state, snapshot);
      return json(snapshot);
    }

    if (url.pathname === "/jobs/renew-finished") {
      if (request.method !== "POST") {
        return methodNotAllowed(["POST"]);
      }

      const body = (await request.json()) as {
        subscriptionVersion?: number;
        subscriptionId?: string | null;
        expirationDateTime?: string | null;
        ok?: boolean;
        reauthRequired?: boolean;
        errorSummary?: string | null;
      };

      let snapshot = await loadSnapshot(this.state);
      if (!snapshot) {
        return notFound("mailbox_not_initialized");
      }

      const versionCheck = assertFreshVersions(
        snapshot.versions,
        body.subscriptionVersion === undefined
          ? {}
          : {
              subscriptionVersion: body.subscriptionVersion,
            },
      );

      if (!versionCheck.accepted) {
        snapshot = recordStaleReject(snapshot);
        await saveSnapshot(this.state, snapshot);
        return json(
          {
            accepted: false,
            reasons: versionCheck.reasons,
            snapshot,
          },
          { status: 409 },
        );
      }

      if (body.ok) {
        snapshot = {
          ...snapshot,
          currentSubscriptionId: body.subscriptionId ?? snapshot.currentSubscriptionId,
          subscriptionExpiresAt:
            body.expirationDateTime ?? snapshot.subscriptionExpiresAt,
        };
        snapshot = transitionLifecycle(snapshot, "healthy", {
          errorSummary: null,
        }).snapshot;
      } else if (body.reauthRequired) {
        snapshot = transitionLifecycle(snapshot, "reauth_required", {
          errorSummary: body.errorSummary ?? "renew failed and requires reauth",
        }).snapshot;
      } else {
        snapshot = transitionLifecycle(snapshot, "delayed", {
          errorSummary: body.errorSummary ?? "renew failed",
        }).snapshot;
      }

      await saveSnapshot(this.state, snapshot);
      return json(snapshot);
    }

    if (url.pathname === "/commands/evaluate-schedule") {
      if (request.method !== "POST") {
        return methodNotAllowed(["POST"]);
      }

      let snapshot = await loadSnapshot(this.state);
      if (!snapshot) {
        return notFound("mailbox_not_initialized");
      }

      const delayThresholdMs = parseDelayThresholdMs(this.env);
      const now = Date.now();
      const lastWebhookAt = snapshot.lastAcceptedWebhookAt
        ? new Date(snapshot.lastAcceptedWebhookAt).getTime()
        : null;

      if (
        snapshot.lifecycleState === "healthy" &&
        lastWebhookAt !== null &&
        now - lastWebhookAt > delayThresholdMs
      ) {
        snapshot = transitionLifecycle(snapshot, "delayed", {
          errorSummary: "operator-visible degraded signal: stale mailbox activity",
        }).snapshot;
      }

      if (snapshot.lifecycleState === "recovery_needed") {
        snapshot = startRecovery(snapshot, {
          errorSummary: snapshot.recentErrorSummary,
        });
        await this.env.MAIL_RECOVER_QUEUE.send(
          createMailRecoverJob({ mailbox: snapshot }),
        );
      }

      const expiresAt = snapshot.subscriptionExpiresAt
        ? new Date(snapshot.subscriptionExpiresAt).getTime()
        : null;

      if (expiresAt !== null && expiresAt - now < 15 * 60 * 1000) {
        snapshot = nextSubscriptionVersion(snapshot);
        await this.env.SUBSCRIPTION_RENEW_QUEUE.send(
          createSubscriptionRenewJob({ mailbox: snapshot }),
        );
      }

      await saveSnapshot(this.state, snapshot);
      return json(snapshot);
    }

    return notFound();
  }
}
