import type {
  MailboxAccountFact,
  OutlookDeltaResult,
  OutlookGraphMessage,
  OutlookSubscriptionResult,
  Phase0Env,
} from "./types";

const GRAPH_MESSAGE_SELECT_FIELDS = [
  "id",
  "internetMessageId",
  "subject",
  "receivedDateTime",
  "bodyPreview",
  "body",
  "from",
  "toRecipients",
  "webLink",
];

const RECOVERY_CURSOR_PREFIX = "recent-scan:";
const RECOVERY_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const RECOVERY_PAGE_SIZE = 50;

interface GraphMessagePayload {
  id: string;
  internetMessageId?: string | null;
  subject?: string | null;
  bodyPreview?: string | null;
  receivedDateTime?: string | null;
  body?: {
    content?: string | null;
  };
  from?: {
    emailAddress?: {
      address?: string | null;
    };
  };
  toRecipients?: Array<{
    emailAddress?: {
      address?: string | null;
    };
  }>;
  webLink?: string | null;
}

interface RecoveryScanCursor {
  since: string;
  nextUrl: string | null;
}

function buildMockMessage(
  mailbox: MailboxAccountFact,
  messageId: string,
): OutlookGraphMessage {
  return {
    id: messageId,
    internetMessageId: `<${messageId}@example.test>`,
    subject: `Verification code for ${mailbox.emailAddress}`,
    fromAddress: "no-reply@example.test",
    toAddresses: [mailbox.emailAddress],
    receivedAt: new Date().toISOString(),
    bodyPreview: "Your verification code is 123456. Redeem your cashback reward today.",
    bodyHtml:
      "<html><body><p>Your verification code is <strong>123456</strong>.</p><p>Redeem your cashback reward today.</p></body></html>",
    webLink: `https://outlook.office.com/mail/inbox/id/${encodeURIComponent(messageId)}`,
    rawPayload: {
      mock: true,
      mailboxId: mailbox.mailboxId,
      messageId,
    },
  };
}

function mapGraphMessage(payload: GraphMessagePayload): OutlookGraphMessage {
  return {
    id: payload.id,
    internetMessageId: payload.internetMessageId ?? null,
    subject: payload.subject ?? "",
    fromAddress: payload.from?.emailAddress?.address ?? null,
    toAddresses:
      payload.toRecipients
        ?.map((recipient) => recipient.emailAddress?.address ?? null)
        .filter((value): value is string => Boolean(value)) ?? [],
    receivedAt: payload.receivedDateTime ?? new Date().toISOString(),
    bodyPreview: payload.bodyPreview ?? "",
    bodyHtml: payload.body?.content ?? null,
    webLink: payload.webLink ?? null,
    rawPayload: payload,
  };
}

function encodeRecoveryCursor(cursor: RecoveryScanCursor): string {
  return `${RECOVERY_CURSOR_PREFIX}${encodeURIComponent(JSON.stringify(cursor))}`;
}

function decodeRecoveryCursor(value: string | null): RecoveryScanCursor | null {
  if (!value?.startsWith(RECOVERY_CURSOR_PREFIX)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      decodeURIComponent(value.slice(RECOVERY_CURSOR_PREFIX.length)),
    ) as Partial<RecoveryScanCursor>;

    if (typeof parsed.since !== "string") {
      return null;
    }

    if (parsed.nextUrl !== null && parsed.nextUrl !== undefined && typeof parsed.nextUrl !== "string") {
      return null;
    }

    return {
      since: parsed.since,
      nextUrl: parsed.nextUrl ?? null,
    };
  } catch {
    return null;
  }
}

function createInitialRecoveryCursor(now = Date.now()): RecoveryScanCursor {
  return {
    since: new Date(now - RECOVERY_LOOKBACK_MS).toISOString(),
    nextUrl: null,
  };
}

export class OutlookGraphClient {
  constructor(private readonly env: Phase0Env) {}

  private getGraphBaseUrl(): string {
    return this.env.GRAPH_BASE_URL ?? "https://graph.microsoft.com/v1.0";
  }

  private getRequiredNotificationUrl(): string {
    const notificationUrl = this.env.OUTLOOK_WEBHOOK_NOTIFICATION_URL?.trim();
    if (!notificationUrl) {
      throw new Error("outlook_webhook_notification_url_missing");
    }

    return notificationUrl;
  }

  async ensureSubscription(input: {
    mailbox: MailboxAccountFact;
    clientState: string;
    accessToken: string | null;
  }): Promise<OutlookSubscriptionResult> {
    if (this.env.PHASE0_GRAPH_MODE === "mock") {
      return {
        subscriptionId: `mock-sub:${input.mailbox.mailboxId}`,
        expirationDateTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        clientState: input.clientState,
      };
    }

    if (!input.accessToken) {
      throw new Error("graph_access_token_missing");
    }

    const notificationUrl = this.getRequiredNotificationUrl();

    const url = new URL(
      `${this.getGraphBaseUrl()}/subscriptions`,
    );
    const response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        changeType: "created",
        notificationUrl,
        lifecycleNotificationUrl: notificationUrl,
        resource: `/users/${input.mailbox.graphUserId}/messages`,
        expirationDateTime: new Date(
          Date.now() + 30 * 60 * 1000,
        ).toISOString(),
        clientState: input.clientState,
      }),
    });

    if (!response.ok) {
      throw new Error(`graph_ensure_subscription_failed:${response.status}`);
    }

    const payload = (await response.json()) as {
      id: string;
      expirationDateTime: string;
      clientState: string;
    };

    return {
      subscriptionId: payload.id,
      expirationDateTime: payload.expirationDateTime,
      clientState: payload.clientState,
    };
  }

  async fetchMessage(input: {
    mailbox: MailboxAccountFact;
    messageId: string;
    accessToken: string | null;
  }): Promise<OutlookGraphMessage> {
    if (this.env.PHASE0_GRAPH_MODE === "mock") {
      return buildMockMessage(input.mailbox, input.messageId);
    }

    if (!input.accessToken) {
      throw new Error("graph_access_token_missing");
    }

    const url = new URL(
      `${this.getGraphBaseUrl()}/users/${encodeURIComponent(input.mailbox.graphUserId)}/messages/${encodeURIComponent(input.messageId)}`,
    );
    url.searchParams.set("$select", GRAPH_MESSAGE_SELECT_FIELDS.join(","));

    const response = await fetch(url, {
      headers: {
        authorization: `Bearer ${input.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`graph_fetch_message_failed:${response.status}`);
    }

    const payload = (await response.json()) as GraphMessagePayload;
    return mapGraphMessage(payload);
  }

  async recoverMessages(input: {
    mailbox: MailboxAccountFact;
    currentCursor: string | null;
    accessToken: string | null;
  }): Promise<OutlookDeltaResult> {
    if (this.env.PHASE0_GRAPH_MODE === "mock") {
      return {
        messages: [buildMockMessage(input.mailbox, `recover-${Date.now()}`)],
        nextCursor: `mock-delta:${Date.now()}`,
        resetCursor: false,
      };
    }

    if (!input.accessToken) {
      throw new Error("graph_access_token_missing");
    }

    const requestStartedAt = new Date().toISOString();
    const cursor = decodeRecoveryCursor(input.currentCursor)
      ?? createInitialRecoveryCursor();
    const resetCursor =
      input.currentCursor !== null && !input.currentCursor.startsWith(RECOVERY_CURSOR_PREFIX);
    const url = cursor.nextUrl
      ? new URL(cursor.nextUrl)
      : new URL(
          `${this.getGraphBaseUrl()}/users/${encodeURIComponent(input.mailbox.graphUserId)}/messages`,
        );

    if (!cursor.nextUrl) {
      url.searchParams.set("$top", String(RECOVERY_PAGE_SIZE));
      url.searchParams.set("$filter", `receivedDateTime ge ${cursor.since}`);
      url.searchParams.set("$select", GRAPH_MESSAGE_SELECT_FIELDS.join(","));
      url.searchParams.set("$orderby", "receivedDateTime desc");
    }

    const response = await fetch(url, {
      headers: {
        authorization: `Bearer ${input.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`graph_delta_failed:${response.status}`);
    }

    const payload = (await response.json()) as {
      value?: GraphMessagePayload[];
      "@odata.deltaLink"?: string;
      "@odata.nextLink"?: string;
    };

    return {
      messages: payload.value?.map(mapGraphMessage) ?? [],
      nextCursor: encodeRecoveryCursor({
        since: payload["@odata.nextLink"] ? cursor.since : requestStartedAt,
        nextUrl: payload["@odata.nextLink"] ?? null,
      }),
      resetCursor,
    };
  }
}
