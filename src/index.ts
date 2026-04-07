import { OutlookAuthHelper } from "./lib/auth-helper";
import { createBlobStore } from "./lib/blob-store";
import { renderConnectResultPage } from "./lib/connect-result-page";
import { createFactsRepository } from "./lib/facts-repository";
import { OutlookGraphClient } from "./lib/graph-client";
import { badRequest, html, json, methodNotAllowed, notFound, readJson, text } from "./lib/http";
import { buildOtpPanelResponse } from "./lib/otp-panel";
import { renderOtpPanelPage } from "./lib/otp-panel-page";
import {
  buildOutlookAuthorizeUrl,
  createRandomOAuthToken,
  exchangeAuthorizationCode,
  fetchOutlookProfile,
} from "./lib/outlook-oauth";
import { parseMessageRules } from "./lib/parser";
import { createMailParseJob } from "./lib/queue-contracts";
import type {
  ConnectIntent,
  CreateConnectIntentRequest,
  MailFetchJob,
  MailParseJob,
  MailRecoverJob,
  MailboxCoordinatorSnapshot,
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

function buildInternalUrl(request: Request, path: string): string {
  return new URL(path, request.url).toString();
}

function redirect(to: string, status = 302): Response {
  return new Response(null, {
    status,
    headers: {
      location: to,
    },
  });
}

function buildConnectResultUrl(request: Request, intentId: string): string {
  return buildInternalUrl(
    request,
    `/connect/result?intentId=${encodeURIComponent(intentId)}`,
  );
}

function isExpired(isoString: string): boolean {
  return new Date(isoString).getTime() <= Date.now();
}

async function failConnectIntentFlow(input: {
  repository: ReturnType<typeof createFactsRepository>;
  intent: ConnectIntent;
  failureReason: string;
}): Promise<void> {
  await input.repository.failConnectIntent({
    intentId: input.intent.id,
    failureReason: input.failureReason,
  });

  if (input.intent.mode === "reauth" && input.intent.targetMailboxId) {
    await input.repository.updateMailboxAuthStatus(
      input.intent.targetMailboxId,
      "reauth_required",
    );
  }
}

async function expireConnectIntentFlow(input: {
  repository: ReturnType<typeof createFactsRepository>;
  intent: ConnectIntent;
}): Promise<void> {
  await input.repository.expireConnectIntent(input.intent.id);

  if (input.intent.mode === "reauth" && input.intent.targetMailboxId) {
    await input.repository.updateMailboxAuthStatus(
      input.intent.targetMailboxId,
      "reauth_required",
    );
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown_error";
}

function isGraphAuthFailure(error: unknown): boolean {
  return (
    error instanceof Error &&
    /^graph_(ensure_subscription_failed|fetch_message_failed|delta_failed):(401|403)$/.test(
      error.message,
    )
  );
}

async function reportMailboxAuthFailure(input: {
  env: Phase0Env;
  repository: ReturnType<typeof createFactsRepository>;
  mailboxId: string;
  stage: "fetch" | "recover" | "renew" | "auth";
  summary: string;
  reauthRequired: boolean;
}): Promise<void> {
  await input.repository.saveMailboxError({
    id: crypto.randomUUID(),
    mailboxId: input.mailboxId,
    stage: input.stage,
    summary: "mailbox auth failed",
    details: input.summary,
    createdAt: new Date().toISOString(),
  });

  if (input.reauthRequired) {
    await input.repository.updateMailboxAuthStatus(
      input.mailboxId,
      "reauth_required",
    );
  }

  await postMailboxCommand(input.env, input.mailboxId, "/jobs/auth-failed", {
    reauthRequired: input.reauthRequired,
    errorSummary: input.summary,
  });
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

  if ((url.pathname === "/" || url.pathname === "/index.html") && request.method === "GET") {
    return html(renderOtpPanelPage());
  }

  if (url.pathname === "/api/mailboxes/connect-intents") {
    if (request.method !== "POST") {
      return methodNotAllowed(["POST"]);
    }

    const body = await readJson<CreateConnectIntentRequest>(request);
    const intentInput: Parameters<typeof repository.createConnectIntent>[0] = {
      mode: "connect",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      stateNonce: createRandomOAuthToken(),
      pkceCodeVerifier: createRandomOAuthToken(48),
    };
    if (body.mailboxLabel !== undefined) {
      intentInput.mailboxLabel = body.mailboxLabel;
    }
    if (body.redirectAfter !== undefined) {
      intentInput.redirectAfter = body.redirectAfter;
    }

    const intent = await repository.createConnectIntent(intentInput);

    return json(
      {
        intentId: intent.id,
        expiresAt: intent.expiresAt,
        startUrl: buildInternalUrl(
          request,
          `/oauth/outlook/start?intentId=${encodeURIComponent(intent.id)}`,
        ),
      },
      { status: 201 },
    );
  }

  if (url.pathname === "/oauth/outlook/start") {
    if (request.method !== "GET") {
      return methodNotAllowed(["GET"]);
    }

    const intentId = url.searchParams.get("intentId");
    if (!intentId) {
      return badRequest("intentId is required");
    }

    const intent = await repository.getConnectIntentById(intentId);
    if (!intent) {
      return notFound("connect_intent_not_found");
    }

    if (intent.status !== "pending") {
      return redirect(buildConnectResultUrl(request, intent.id));
    }

    if (isExpired(intent.expiresAt)) {
      await expireConnectIntentFlow({
        repository,
        intent,
      });
      return redirect(buildConnectResultUrl(request, intent.id));
    }

    const authorizeUrl = await buildOutlookAuthorizeUrl({
      env,
      intent,
    });
    return redirect(authorizeUrl);
  }

  if (url.pathname === "/oauth/outlook/callback") {
    if (request.method !== "GET") {
      return methodNotAllowed(["GET"]);
    }

    const stateNonce = url.searchParams.get("state");
    if (!stateNonce) {
      return badRequest("state is required");
    }

    const intent = await repository.getConnectIntentByStateNonce(stateNonce);
    if (!intent) {
      return notFound("connect_intent_not_found");
    }

    if (intent.status === "completed" || intent.status === "failed" || intent.status === "expired") {
      return redirect(buildConnectResultUrl(request, intent.id));
    }

    if (isExpired(intent.expiresAt)) {
      await expireConnectIntentFlow({
        repository,
        intent,
      });
      return redirect(buildConnectResultUrl(request, intent.id));
    }

    const oauthError = url.searchParams.get("error");
    if (oauthError) {
      await failConnectIntentFlow({
        repository,
        intent,
        failureReason: oauthError,
      });
      return redirect(buildConnectResultUrl(request, intent.id));
    }

    const code = url.searchParams.get("code");
    if (!code) {
      await failConnectIntentFlow({
        repository,
        intent,
        failureReason: "oauth_callback_code_missing",
      });
      return redirect(buildConnectResultUrl(request, intent.id));
    }

    try {
      const tokenSet = await exchangeAuthorizationCode({
        env,
        code,
        codeVerifier: intent.pkceCodeVerifier,
      });
      const profile = await fetchOutlookProfile({
        env,
        accessToken: tokenSet.accessToken,
      });
      const targetMailbox =
        intent.mode === "reauth" && intent.targetMailboxId
          ? await repository.getMailboxAccount(intent.targetMailboxId)
          : null;
      if (intent.mode === "reauth" && !targetMailbox) {
        throw new Error("reauthorize_target_mailbox_missing");
      }
      if (
        targetMailbox?.providerAccountId &&
        targetMailbox.providerAccountId !== profile.providerAccountId
      ) {
        throw new Error("reauthorize_provider_account_mismatch");
      }

      const mailboxId = targetMailbox?.mailboxId ?? profile.providerAccountId;

      await repository.upsertMailboxAccount({
        mailboxId,
        emailAddress: profile.emailAddress,
        graphUserId: profile.graphUserId,
        providerAccountId: profile.providerAccountId,
        authStatus: "active",
      });
      await repository.upsertMailboxCredential({
        mailboxId,
        accessToken: tokenSet.accessToken,
        ...(tokenSet.refreshToken ? { refreshToken: tokenSet.refreshToken } : {}),
        tokenExpiresAt: tokenSet.tokenExpiresAt,
      });

      await postMailboxCommand<MailboxCoordinatorSnapshot>(
        env,
        mailboxId,
        "/commands/onboard",
        {
          mailboxId,
        },
      );
      await repository.completeConnectIntent({
        intentId: intent.id,
        targetMailboxId: mailboxId,
      });
    } catch (error) {
      await failConnectIntentFlow({
        repository,
        intent,
        failureReason: getErrorMessage(error),
      });
    }

    return redirect(buildConnectResultUrl(request, intent.id));
  }

  if (url.pathname === "/connect/result") {
    if (request.method !== "GET") {
      return methodNotAllowed(["GET"]);
    }

    const intentId = url.searchParams.get("intentId");
    if (!intentId) {
      return badRequest("intentId is required");
    }

    const intent = await repository.getConnectIntentById(intentId);
    if (!intent) {
      return notFound("connect_intent_not_found");
    }

    if (intent.status === "pending" && isExpired(intent.expiresAt)) {
      await expireConnectIntentFlow({
        repository,
        intent,
      });
    }

    const refreshedIntent =
      (await repository.getConnectIntentById(intentId)) ?? intent;
    const mailbox = refreshedIntent.targetMailboxId
      ? await repository.getMailboxAccount(refreshedIntent.targetMailboxId)
      : null;
    const subscription = refreshedIntent.targetMailboxId
      ? await repository.getMailboxSubscription(refreshedIntent.targetMailboxId)
      : null;

    if (refreshedIntent.status === "completed") {
      return html(
        renderConnectResultPage({
          title:
            refreshedIntent.mode === "reauth"
              ? "Outlook 重新授权完成"
              : "Outlook 授权完成",
          headline: subscription
            ? refreshedIntent.mode === "reauth"
              ? "邮箱重新授权成功"
              : "邮箱已激活"
            : refreshedIntent.mode === "reauth"
              ? "重新授权成功，激活进行中"
              : "授权成功，激活进行中",
          description: subscription
            ? refreshedIntent.mode === "reauth"
              ? "邮箱凭证已经更新并重新进入正常运行。"
              : "邮箱已经完成授权并建立订阅。"
            : refreshedIntent.mode === "reauth"
              ? "凭证已经更新，系统正在异步恢复 Graph 订阅。"
              : "授权和凭证落库已经完成，系统正在异步建立 Graph 订阅。",
          detail: mailbox
            ? `mailboxId: ${mailbox.mailboxId}\nemail: ${mailbox.emailAddress}\nauthStatus: ${mailbox.authStatus}`
            : null,
          continueHref: refreshedIntent.redirectAfter,
        }),
      );
    }

    if (refreshedIntent.status === "failed") {
      return html(
        renderConnectResultPage({
          title:
            refreshedIntent.mode === "reauth"
              ? "Outlook 重新授权失败"
              : "Outlook 授权失败",
          headline: refreshedIntent.mode === "reauth" ? "重新授权失败" : "授权失败",
          description:
            refreshedIntent.mode === "reauth"
              ? "重新授权没有完成，邮箱仍然保持需要重新授权的状态。"
              : "授权流程没有完成，系统还没有接管这个邮箱。",
          detail: refreshedIntent.failureReason,
          continueHref: refreshedIntent.redirectAfter,
        }),
      );
    }

    if (refreshedIntent.status === "expired") {
      return html(
        renderConnectResultPage({
          title:
            refreshedIntent.mode === "reauth"
              ? "Outlook 重新授权已过期"
              : "Outlook 授权已过期",
          headline:
            refreshedIntent.mode === "reauth" ? "重新授权链接已过期" : "授权链接已过期",
          description:
            refreshedIntent.mode === "reauth"
              ? "这次重新授权意图已经过期，邮箱仍然保持需要重新授权的状态。"
              : "这次接入意图已经过期，请重新发起授权。",
          continueHref: refreshedIntent.redirectAfter,
        }),
      );
    }

    return html(
      renderConnectResultPage({
        title: "Outlook 授权进行中",
        headline: "等待完成授权",
        description: "授权流程已经发起，但还没有完成回调。",
        continueHref: refreshedIntent.redirectAfter,
      }),
    );
  }

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

  if (url.pathname === "/api/otp-panel") {
    if (request.method !== "GET") {
      return methodNotAllowed(["GET"]);
    }

    const mailboxes = await repository.listMailboxAccounts();
    const [currentSignals, recentSignalHistory, mailboxSnapshots] = await Promise.all([
      repository.listCurrentSignals({
        limit: 200,
      }),
      repository.listSignalHistory({
        signalType: "verification_code",
        limit: 10,
      }),
      Promise.all(
        mailboxes.map(async (mailbox) => ({
          mailboxId: mailbox.mailboxId,
          snapshot: await fetchMailboxSnapshot(env, mailbox.mailboxId),
        })),
      ),
    ]);

    return json(
      buildOtpPanelResponse({
        mailboxes,
        snapshotsByMailboxId: new Map(
          mailboxSnapshots.map((item) => [item.mailboxId, item.snapshot]),
        ),
        currentSignals,
        recentSignalHistory,
      }),
    );
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

  const reauthorizeMatch = url.pathname.match(/^\/api\/mailboxes\/([^/]+)\/reauthorize$/);
  if (reauthorizeMatch) {
    if (request.method !== "POST") {
      return methodNotAllowed(["POST"]);
    }

    const mailboxId = decodeURIComponent(reauthorizeMatch[1] ?? "");
    const mailbox = await repository.getMailboxAccount(mailboxId);
    if (!mailbox) {
      return notFound("mailbox_not_found");
    }

    const body = await readJson<CreateConnectIntentRequest>(request);

    const intentInput: Parameters<typeof repository.createConnectIntent>[0] = {
      mode: "reauth",
      targetMailboxId: mailboxId,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      stateNonce: createRandomOAuthToken(),
      pkceCodeVerifier: createRandomOAuthToken(48),
    };
    if (body.redirectAfter !== undefined) {
      intentInput.redirectAfter = body.redirectAfter;
    }

    const intent = await repository.createConnectIntent(intentInput);
    await repository.updateMailboxAuthStatus(mailboxId, "pending_auth");

    return json(
      {
        intentId: intent.id,
        mailboxId,
        expiresAt: intent.expiresAt,
        startUrl: buildInternalUrl(
          request,
          `/oauth/outlook/start?intentId=${encodeURIComponent(intent.id)}`,
        ),
      },
      { status: 201 },
    );
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
  const authHelper = new OutlookAuthHelper(env, repository);
  const mailbox = await repository.getMailboxAccount(job.mailboxId);
  if (!mailbox) {
    throw new Error(`mailbox_not_found:${job.mailboxId}`);
  }

  const accessTokenResult = await authHelper.getMailboxAccessToken(mailbox);
  if (!accessTokenResult.ok || !accessTokenResult.accessToken) {
    await reportMailboxAuthFailure({
      env,
      repository,
      mailboxId: job.mailboxId,
      stage: "fetch",
      summary: accessTokenResult.error ?? "graph_access_token_unavailable",
      reauthRequired: accessTokenResult.reauthRequired,
    });
    throw new Error(accessTokenResult.error ?? "graph_access_token_unavailable");
  }

  let graphMessage;
  try {
    graphMessage = await graphClient.fetchMessage({
      mailbox,
      messageId: job.messageId,
      accessToken: accessTokenResult.accessToken,
    });
  } catch (error) {
    if (!isGraphAuthFailure(error)) {
      throw error;
    }

    const refreshResult = await authHelper.refreshMailboxAccessToken(mailbox);
    if (!refreshResult.ok || !refreshResult.accessToken) {
      await reportMailboxAuthFailure({
        env,
        repository,
        mailboxId: job.mailboxId,
        stage: "fetch",
        summary: refreshResult.error ?? getErrorMessage(error),
        reauthRequired: refreshResult.reauthRequired,
      });
      throw error;
    }

    graphMessage = await graphClient.fetchMessage({
      mailbox,
      messageId: job.messageId,
      accessToken: refreshResult.accessToken,
    });
  }

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

  await repository.saveParseArtifacts(parsed);
}

async function handleRecoverJob(job: MailRecoverJob, env: Phase0Env): Promise<void> {
  const repository = createFactsRepository(env);
  const graphClient = new OutlookGraphClient(env);
  const authHelper = new OutlookAuthHelper(env, repository);
  const mailbox = await repository.getMailboxAccount(job.mailboxId);
  if (!mailbox) {
    throw new Error(`mailbox_not_found:${job.mailboxId}`);
  }

  const accessTokenResult = await authHelper.getMailboxAccessToken(mailbox);
  if (!accessTokenResult.ok || !accessTokenResult.accessToken) {
    await reportMailboxAuthFailure({
      env,
      repository,
      mailboxId: job.mailboxId,
      stage: "recover",
      summary: accessTokenResult.error ?? "graph_access_token_unavailable",
      reauthRequired: accessTokenResult.reauthRequired,
    });
    throw new Error(accessTokenResult.error ?? "graph_access_token_unavailable");
  }

  let delta;
  try {
    delta = await graphClient.recoverMessages({
      mailbox,
      currentCursor: job.currentCursor,
      accessToken: accessTokenResult.accessToken,
    });
  } catch (error) {
    if (!isGraphAuthFailure(error)) {
      throw error;
    }

    const refreshResult = await authHelper.refreshMailboxAccessToken(mailbox);
    if (!refreshResult.ok || !refreshResult.accessToken) {
      await reportMailboxAuthFailure({
        env,
        repository,
        mailboxId: job.mailboxId,
        stage: "recover",
        summary: refreshResult.error ?? getErrorMessage(error),
        reauthRequired: refreshResult.reauthRequired,
      });
      throw error;
    }

    delta = await graphClient.recoverMessages({
      mailbox,
      currentCursor: job.currentCursor,
      accessToken: refreshResult.accessToken,
    });
  }

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
    const accessTokenResult = await authHelper.getMailboxAccessToken(mailbox);
    if (!accessTokenResult.ok || !accessTokenResult.accessToken) {
      await reportMailboxAuthFailure({
        env,
        repository,
        mailboxId: job.mailboxId,
        stage: "renew",
        summary: accessTokenResult.error ?? "graph_access_token_unavailable",
        reauthRequired: accessTokenResult.reauthRequired,
      });

      await postMailboxCommand(env, job.mailboxId, "/jobs/renew-finished", {
        subscriptionVersion: job.versions.subscriptionVersion,
        ok: false,
        reauthRequired: accessTokenResult.reauthRequired,
        errorSummary: accessTokenResult.error ?? "renew_failed",
      });
      return;
    }

    const subscription = await graphClient.ensureSubscription({
      mailbox,
      clientState,
      accessToken: accessTokenResult.accessToken,
    });

    await repository.upsertMailboxSubscription({
      mailboxId: job.mailboxId,
      subscriptionId: subscription.subscriptionId,
      clientState: subscription.clientState,
      subscriptionVersion: job.versions.subscriptionVersion,
      expirationDateTime: subscription.expirationDateTime,
    });
    await repository.updateMailboxAuthStatus(job.mailboxId, "active");

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
        accessToken: refreshResult.accessToken,
      });

      await repository.upsertMailboxSubscription({
        mailboxId: job.mailboxId,
        subscriptionId: retrySubscription.subscriptionId,
        clientState: retrySubscription.clientState,
        subscriptionVersion: job.versions.subscriptionVersion,
        expirationDateTime: retrySubscription.expirationDateTime,
      });
      await repository.updateMailboxAuthStatus(job.mailboxId, "active");

      await postMailboxCommand(env, job.mailboxId, "/jobs/renew-finished", {
        subscriptionVersion: job.versions.subscriptionVersion,
        subscriptionId: retrySubscription.subscriptionId,
        expirationDateTime: retrySubscription.expirationDateTime,
        ok: true,
      });
      return;
    }

    await reportMailboxAuthFailure({
      env,
      repository,
      mailboxId: job.mailboxId,
      stage: "renew",
      summary: refreshResult.error ?? getErrorMessage(error),
      reauthRequired: refreshResult.reauthRequired,
    });

    await repository.saveMailboxError({
      id: crypto.randomUUID(),
      mailboxId: job.mailboxId,
      stage: "renew",
      summary: "subscription renew failed",
      details:
        getErrorMessage(error),
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
