import { OutlookAuthHelper } from "./lib/auth-helper";
import { createBlobStore } from "./lib/blob-store";
import { createFactsRepository } from "./lib/facts-repository";
import { OutlookGraphClient } from "./lib/graph-client";
import { badRequest, json, methodNotAllowed, notFound, readJson, text } from "./lib/http";
import { parseMessageRules } from "./lib/parser";
import { createMailParseJob } from "./lib/queue-contracts";
import type {
  MailFetchJob,
  MailParseJob,
  MailRecoverJob,
  MailboxCoordinatorSnapshot,
  OnboardMailboxRequest,
  OutlookNotification,
  OutlookWebhookPayload,
  Phase0Env,
  QueueJob,
  RoutedWebhookNotification,
  SubscriptionRenewJob,
} from "./lib/types";
import { MailboxCoordinator } from "./durable-objects/mailbox-coordinator";

function requireBinding<T>(value: T | undefined, bindingName: string): T {
  if (!value) {
    throw new Error(`missing_binding:${bindingName}`);
  }

  return value;
}

function mailboxCoordinatorStub(env: Phase0Env, mailboxId: string): DurableObjectStub {
  const namespace = requireBinding(env.MAILBOX_COORDINATOR, "MAILBOX_COORDINATOR");
  return namespace.get(namespace.idFromName(mailboxId));
}

function makeExecutionContext(): ExecutionContext {
  return {
    waitUntil() {},
    passThroughOnException() {},
    props: {},
  };
}

function getDelayThresholdMs(env: Phase0Env): number {
  return Number.parseInt(env.PHASE0_DELAY_THRESHOLD_MS ?? "300000", 10);
}

function parseBoolean(value: string | null): boolean | undefined {
  if (value === null) {
    return undefined;
  }

  return value === "true";
}

function createEventId(notification: OutlookNotification): string {
  return [
    notification.subscriptionId,
    notification.changeType ?? "",
    notification.lifecycleEvent ?? "",
    notification.resourceData?.id ?? "",
  ].join(":");
}

async function fetchMailboxSnapshot(
  env: Phase0Env,
  mailboxId: string,
): Promise<MailboxCoordinatorSnapshot | null> {
  const response = await mailboxCoordinatorStub(env, mailboxId).fetch(
    new Request("https://mailbox.internal/snapshot"),
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`mailbox_snapshot_fetch_failed:${response.status}`);
  }

  return (await response.json()) as MailboxCoordinatorSnapshot;
}

async function postMailboxCommand<T>(
  env: Phase0Env,
  mailboxId: string,
  path: string,
  payload: unknown,
): Promise<T> {
  const response = await mailboxCoordinatorStub(env, mailboxId).fetch(
    new Request(`https://mailbox.internal${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    }),
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `mailbox_command_failed:${path}:${response.status}:${errorBody}`,
    );
  }

  return (await response.json()) as T;
}

function buildBlobKey(prefix: string, mailboxId: string, suffix: string): string {
  return `${prefix}/${mailboxId}/${Date.now()}-${suffix}`;
}

function normalizeGraphMessage(input: {
  mailboxId: string;
  graphMessage: Awaited<ReturnType<OutlookGraphClient["fetchMessage"]>>;
  bodyHtmlBlobKey: string | null;
  rawPayloadBlobKey: string | null;
}) {
  return {
    id: input.graphMessage.id,
    mailboxId: input.mailboxId,
    internetMessageId: input.graphMessage.internetMessageId,
    subject: input.graphMessage.subject,
    fromAddress: input.graphMessage.fromAddress,
    toAddresses: input.graphMessage.toAddresses,
    receivedAt: input.graphMessage.receivedAt,
    preview: input.graphMessage.bodyPreview,
    excerpt: input.graphMessage.bodyPreview.slice(0, 280),
    bodyHtmlBlobKey: input.bodyHtmlBlobKey,
    rawPayloadBlobKey: input.rawPayloadBlobKey,
    webLink: input.graphMessage.webLink,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function handleRequest(
  request: Request,
  env: Phase0Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  const repository = createFactsRepository(env);
  const blobStore = createBlobStore(env);

  if (url.pathname === "/api/webhooks/outlook") {
    if (url.searchParams.has("validationToken")) {
      return text(url.searchParams.get("validationToken") ?? "");
    }

    if (request.method !== "POST") {
      return methodNotAllowed(["POST"]);
    }

    const rawPayload = await readJson<OutlookWebhookPayload>(request);
    if (!Array.isArray(rawPayload.value)) {
      return badRequest("payload.value must be an array");
    }

    const rawPayloadKey = buildBlobKey("webhook/raw", "batch", crypto.randomUUID());
    ctx.waitUntil(blobStore.putJson(rawPayloadKey, rawPayload));

    const grouped = new Map<string, RoutedWebhookNotification[]>();
    const rejected: Array<{ subscriptionId?: string; reason: string }> = [];

    for (const notification of rawPayload.value) {
      if (!notification.subscriptionId) {
        rejected.push({ reason: "missing_subscription_id" });
        continue;
      }

      const subscription = await repository.resolveMailboxBySubscriptionId(
        notification.subscriptionId,
      );
      if (!subscription) {
        rejected.push({
          subscriptionId: notification.subscriptionId,
          reason: "unknown_subscription",
        });
        continue;
      }

      const expectedClientState =
        subscription.clientState || env.OUTLOOK_WEBHOOK_CLIENT_STATE;
      if (
        expectedClientState &&
        notification.clientState !== expectedClientState
      ) {
        rejected.push({
          subscriptionId: notification.subscriptionId,
          reason: "client_state_mismatch",
        });
        continue;
      }

      const mailboxEvents = grouped.get(subscription.mailboxId) ?? [];
      mailboxEvents.push({
        eventId: createEventId(notification),
        mailboxId: subscription.mailboxId,
        subscriptionVersion: subscription.subscriptionVersion,
        rawPayloadKey,
        notification,
      });
      grouped.set(subscription.mailboxId, mailboxEvents);
    }

    const accepted: Array<{ mailboxId: string; count: number }> = [];

    for (const [mailboxId, events] of grouped.entries()) {
      await postMailboxCommand(env, mailboxId, "/webhooks/outlook", {
        mailboxId,
        events,
      });
      accepted.push({
        mailboxId,
        count: events.length,
      });
    }

    return json(
      {
        accepted,
        rejected,
      },
      { status: 202 },
    );
  }

  if (url.pathname === "/api/mailboxes") {
    if (request.method !== "POST") {
      return methodNotAllowed(["POST"]);
    }

    const body = await readJson<OnboardMailboxRequest>(request);
    if (!body.mailboxId || !body.emailAddress) {
      return badRequest("mailboxId and emailAddress are required");
    }

    const mailbox = await repository.upsertMailboxAccount(body);
    if (body.accessToken || body.refreshToken || body.tokenExpiresAt) {
      const credentialInput: {
        mailboxId: string;
        accessToken?: string;
        refreshToken?: string;
        tokenExpiresAt?: string;
      } = {
        mailboxId: mailbox.mailboxId,
      };
      if (body.accessToken !== undefined) {
        credentialInput.accessToken = body.accessToken;
      }
      if (body.refreshToken !== undefined) {
        credentialInput.refreshToken = body.refreshToken;
      }
      if (body.tokenExpiresAt !== undefined) {
        credentialInput.tokenExpiresAt = body.tokenExpiresAt;
      }

      await repository.upsertMailboxCredential({
        ...credentialInput,
      });
    }

    const state = await postMailboxCommand<MailboxCoordinatorSnapshot>(
      env,
      mailbox.mailboxId,
      "/commands/onboard",
      {
        mailboxId: mailbox.mailboxId,
      },
    );

    return json(
      {
        mailbox,
        state,
        subscriptionRenewQueued: true,
      },
      { status: 201 },
    );
  }

  if (url.pathname === "/api/hits") {
    if (request.method !== "GET") {
      return methodNotAllowed(["GET"]);
    }

    const hitsQuery: {
      mailboxId?: string;
      processed?: boolean;
      hitType?: "verification_code" | "reward" | "cashback" | "redeem";
      limit?: number;
    } = {};

    const mailboxId = url.searchParams.get("mailboxId");
    if (mailboxId !== null) {
      hitsQuery.mailboxId = mailboxId;
    }

    const processed = parseBoolean(url.searchParams.get("processed"));
    if (processed !== undefined) {
      hitsQuery.processed = processed;
    }

    const hitType = url.searchParams.get("hitType");
    if (
      hitType === "verification_code" ||
      hitType === "reward" ||
      hitType === "cashback" ||
      hitType === "redeem"
    ) {
      hitsQuery.hitType = hitType;
    }

    const limit = url.searchParams.get("limit");
    if (limit !== null) {
      hitsQuery.limit = Number.parseInt(limit, 10);
    }

    const hits = await repository.listHits(hitsQuery);

    return json({ hits });
  }

  const messageMatch = url.pathname.match(/^\/api\/messages\/([^/]+)$/);
  if (messageMatch) {
    if (request.method !== "GET") {
      return methodNotAllowed(["GET"]);
    }

    const messageId = decodeURIComponent(messageMatch[1] ?? "");
    const detail = await repository.getMessageDetail(messageId);
    if (!detail) {
      return notFound("message_not_found");
    }

    let bodyHtml: string | null = null;
    let blobMissing = false;

    if (detail.message.bodyHtmlBlobKey) {
      bodyHtml = await blobStore.getText(detail.message.bodyHtmlBlobKey);
      blobMissing = bodyHtml === null;
    }

    return json({
      ...detail,
      bodyHtml,
      blobMissing,
    });
  }

  const mailboxMatch = url.pathname.match(/^\/api\/mailboxes\/([^/]+)$/);
  if (mailboxMatch) {
    if (request.method !== "GET") {
      return methodNotAllowed(["GET"]);
    }

    const mailboxId = decodeURIComponent(mailboxMatch[1] ?? "");
    const mailbox = await repository.getMailboxAccount(mailboxId);
    if (!mailbox) {
      return notFound("mailbox_not_found");
    }

    const state = await fetchMailboxSnapshot(env, mailboxId);
    const aggregates = await repository.getMailboxAggregates(mailboxId);
    const subscription = await repository.getMailboxSubscription(mailboxId);
    const cursor = await repository.getMailboxCursor(mailboxId);

    return json({
      mailbox,
      state,
      aggregates,
      subscription,
      cursor,
    });
  }

  const recoveryMatch = url.pathname.match(/^\/api\/mailboxes\/([^/]+)\/recovery$/);
  if (recoveryMatch) {
    if (request.method !== "POST") {
      return methodNotAllowed(["POST"]);
    }

    const mailboxId = decodeURIComponent(recoveryMatch[1] ?? "");
    const mailbox = await repository.getMailboxAccount(mailboxId);
    if (!mailbox) {
      return notFound("mailbox_not_found");
    }

    const payload = await postMailboxCommand<MailboxCoordinatorSnapshot>(
      env,
      mailboxId,
      "/commands/start-recovery",
      {
        mailboxId,
        reason: "manual_recovery_request",
      },
    );

    return json(payload, { status: 202 });
  }

  return notFound();
}

async function notifyMailboxFetchFinished(
  env: Phase0Env,
  mailboxId: string,
  queueLagMs: number,
): Promise<void> {
  await postMailboxCommand(env, mailboxId, "/jobs/fetch-finished", {
    queueLagMs,
  });
}

async function handleFetchJob(job: MailFetchJob, env: Phase0Env): Promise<void> {
  const repository = createFactsRepository(env);
  const blobStore = createBlobStore(env);
  const graphClient = new OutlookGraphClient(env);
  const mailbox = await repository.getMailboxAccount(job.mailboxId);
  if (!mailbox) {
    throw new Error(`mailbox_not_found:${job.mailboxId}`);
  }

  const graphMessage = await graphClient.fetchMessage({
    mailbox,
    messageId: job.messageId,
  });

  const bodyHtmlBlobKey = graphMessage.bodyHtml
    ? buildBlobKey("message/body-html", job.mailboxId, `${job.messageId}.html`)
    : null;
  const rawPayloadBlobKey = buildBlobKey(
    "message/raw",
    job.mailboxId,
    `${job.messageId}.json`,
  );

  if (graphMessage.bodyHtml) {
    await blobStore.putText(bodyHtmlBlobKey!, graphMessage.bodyHtml);
  }
  await blobStore.putJson(rawPayloadBlobKey, graphMessage.rawPayload);

  const message = normalizeGraphMessage({
    mailboxId: job.mailboxId,
    graphMessage,
    bodyHtmlBlobKey,
    rawPayloadBlobKey,
  });
  await repository.saveMessage(message);

  const snapshot = await fetchMailboxSnapshot(env, job.mailboxId);
  if (!snapshot) {
    throw new Error(`mailbox_snapshot_missing:${job.mailboxId}`);
  }

  await env.MAIL_PARSE_QUEUE.send(
    createMailParseJob({
      mailbox: snapshot,
      messageId: message.id,
    }),
  );

  const queueLagMs = Date.now() - new Date(job.enqueuedAt).getTime();
  await notifyMailboxFetchFinished(env, job.mailboxId, queueLagMs);
}

async function handleParseJob(job: MailParseJob, env: Phase0Env): Promise<void> {
  const repository = createFactsRepository(env);
  const blobStore = createBlobStore(env);
  const message = await repository.getMessage(job.messageId);

  if (!message) {
    throw new Error(`message_not_found:${job.messageId}`);
  }

  const bodyHtml = message.bodyHtmlBlobKey
    ? await blobStore.getText(message.bodyHtmlBlobKey)
    : null;
  const parsed = parseMessageRules({
    message,
    bodyHtml,
  });

  await repository.saveRuleMatches(parsed.matches);
  await repository.saveHitEvents(parsed.hits);
}

async function handleRecoverJob(job: MailRecoverJob, env: Phase0Env): Promise<void> {
  const repository = createFactsRepository(env);
  const graphClient = new OutlookGraphClient(env);
  const mailbox = await repository.getMailboxAccount(job.mailboxId);
  if (!mailbox) {
    throw new Error(`mailbox_not_found:${job.mailboxId}`);
  }

  const delta = await graphClient.recoverMessages({
    mailbox,
    currentCursor: job.currentCursor,
  });

  const snapshot = await fetchMailboxSnapshot(env, job.mailboxId);
  if (!snapshot) {
    throw new Error(`mailbox_snapshot_missing:${job.mailboxId}`);
  }

  for (const message of delta.messages) {
    await env.MAIL_FETCH_QUEUE.send({
      kind: "mail.fetch",
      mailboxId: job.mailboxId,
      messageId: message.id,
      rawPayloadKey: null,
      source: "recovery",
      enqueuedAt: new Date().toISOString(),
      versions: {
        subscriptionVersion: snapshot.versions.subscriptionVersion,
        recoveryGeneration: snapshot.versions.recoveryGeneration,
        cursorGeneration: snapshot.versions.cursorGeneration,
      },
    });
  }

  const finishResponse = await mailboxCoordinatorStub(env, job.mailboxId).fetch(
    new Request("https://mailbox.internal/jobs/recovery-finished", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        recoveryGeneration: job.versions.recoveryGeneration,
        cursorGeneration: snapshot.versions.cursorGeneration,
        expectedCurrentCursor: job.currentCursor,
        nextCursor: delta.nextCursor,
        resetCursor: delta.resetCursor,
      }),
    }),
  );

  if (!finishResponse.ok) {
    throw new Error(`recovery_finish_failed:${finishResponse.status}`);
  }

  const payload = (await finishResponse.json()) as {
    accepted: boolean;
    snapshot: MailboxCoordinatorSnapshot;
  };

  if (payload.accepted) {
    await repository.upsertMailboxCursor({
      mailboxId: job.mailboxId,
      cursorGeneration: payload.snapshot.versions.cursorGeneration,
      deltaToken: delta.nextCursor,
    });
  }
}

async function handleRenewJob(
  job: SubscriptionRenewJob,
  env: Phase0Env,
): Promise<void> {
  const repository = createFactsRepository(env);
  const graphClient = new OutlookGraphClient(env);
  const authHelper = new OutlookAuthHelper(env, repository);
  const mailbox = await repository.getMailboxAccount(job.mailboxId);
  if (!mailbox) {
    throw new Error(`mailbox_not_found:${job.mailboxId}`);
  }

  const clientState =
    (await repository.getMailboxSubscription(job.mailboxId))?.clientState ??
    env.OUTLOOK_WEBHOOK_CLIENT_STATE ??
    `client-state:${job.mailboxId}`;

  try {
    const subscription = await graphClient.ensureSubscription({
      mailbox,
      clientState,
    });

    await repository.upsertMailboxSubscription({
      mailboxId: job.mailboxId,
      subscriptionId: subscription.subscriptionId,
      clientState: subscription.clientState,
      subscriptionVersion: job.versions.subscriptionVersion,
      expirationDateTime: subscription.expirationDateTime,
    });

    await postMailboxCommand(env, job.mailboxId, "/jobs/renew-finished", {
      subscriptionVersion: job.versions.subscriptionVersion,
      subscriptionId: subscription.subscriptionId,
      expirationDateTime: subscription.expirationDateTime,
      ok: true,
    });
  } catch (error) {
    const refreshResult = await authHelper.refreshMailboxAccessToken(mailbox);

    if (refreshResult.ok) {
      const retrySubscription = await graphClient.ensureSubscription({
        mailbox,
        clientState,
      });

      await repository.upsertMailboxSubscription({
        mailboxId: job.mailboxId,
        subscriptionId: retrySubscription.subscriptionId,
        clientState: retrySubscription.clientState,
        subscriptionVersion: job.versions.subscriptionVersion,
        expirationDateTime: retrySubscription.expirationDateTime,
      });

      await postMailboxCommand(env, job.mailboxId, "/jobs/renew-finished", {
        subscriptionVersion: job.versions.subscriptionVersion,
        subscriptionId: retrySubscription.subscriptionId,
        expirationDateTime: retrySubscription.expirationDateTime,
        ok: true,
      });
      return;
    }

    await repository.saveMailboxError({
      id: crypto.randomUUID(),
      mailboxId: job.mailboxId,
      stage: "renew",
      summary: "subscription renew failed",
      details:
        error instanceof Error ? error.message : "unknown_renew_failure",
      createdAt: new Date().toISOString(),
    });

    await postMailboxCommand(env, job.mailboxId, "/jobs/renew-finished", {
      subscriptionVersion: job.versions.subscriptionVersion,
      ok: false,
      reauthRequired: refreshResult.reauthRequired,
      errorSummary: refreshResult.error ?? "renew_failed",
    });
  }
}

export async function dispatchQueueJob(
  job: QueueJob,
  env: Phase0Env,
): Promise<void> {
  if (job.kind === "mail.fetch") {
    return handleFetchJob(job, env);
  }

  if (job.kind === "mail.parse") {
    return handleParseJob(job, env);
  }

  if (job.kind === "mail.recover") {
    return handleRecoverJob(job, env);
  }

  if (job.kind === "subscription.renew") {
    return handleRenewJob(job, env);
  }

  const unsupported: never = job;
  throw new Error(`unsupported_job_kind:${JSON.stringify(unsupported)}`);
}

const worker: ExportedHandler<Phase0Env> = {
  async fetch(request, env, ctx): Promise<Response> {
    return handleRequest(request, env, ctx);
  },

  async queue(batch, env): Promise<void> {
    for (const message of batch.messages) {
      await dispatchQueueJob(message.body as QueueJob, env);
    }
  },

  async scheduled(_controller, env, ctx): Promise<void> {
    const repository = createFactsRepository(env);
    const mailboxes = await repository.listMailboxAccounts();

    for (const mailbox of mailboxes) {
      ctx.waitUntil(
        postMailboxCommand(env, mailbox.mailboxId, "/commands/evaluate-schedule", {}),
      );
    }
  },
};

export { MailboxCoordinator };
export default worker;

export function createTestExecutionContext(): ExecutionContext {
  return makeExecutionContext();
}
