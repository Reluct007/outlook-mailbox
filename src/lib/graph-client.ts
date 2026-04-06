import type {
  MailboxAccountFact,
  OutlookDeltaResult,
  OutlookGraphMessage,
  OutlookSubscriptionResult,
  Phase0Env,
} from "./types";

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

export class OutlookGraphClient {
  constructor(private readonly env: Phase0Env) {}

  async ensureSubscription(input: {
    mailbox: MailboxAccountFact;
    clientState: string;
  }): Promise<OutlookSubscriptionResult> {
    if (
      this.env.PHASE0_GRAPH_MODE === "mock" ||
      !this.env.OUTLOOK_GRAPH_ACCESS_TOKEN
    ) {
      return {
        subscriptionId: `mock-sub:${input.mailbox.mailboxId}`,
        expirationDateTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        clientState: input.clientState,
      };
    }

    const url = new URL(
      `${this.env.GRAPH_BASE_URL ?? "https://graph.microsoft.com/v1.0"}/subscriptions`,
    );
    const response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.env.OUTLOOK_GRAPH_ACCESS_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        changeType: "created",
        notificationUrl: "https://example.com/api/webhooks/outlook",
        resource: `/users/${input.mailbox.graphUserId}/mailFolders('Inbox')/messages`,
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
  }): Promise<OutlookGraphMessage> {
    if (
      this.env.PHASE0_GRAPH_MODE === "mock" ||
      !this.env.OUTLOOK_GRAPH_ACCESS_TOKEN
    ) {
      return buildMockMessage(input.mailbox, input.messageId);
    }

    const url = new URL(
      `${this.env.GRAPH_BASE_URL ?? "https://graph.microsoft.com/v1.0"}/users/${encodeURIComponent(input.mailbox.graphUserId)}/messages/${encodeURIComponent(input.messageId)}`,
    );
    url.searchParams.set(
      "$select",
      [
        "id",
        "internetMessageId",
        "subject",
        "receivedDateTime",
        "bodyPreview",
        "body",
        "from",
        "toRecipients",
        "webLink",
      ].join(","),
    );

    const response = await fetch(url, {
      headers: {
        authorization: `Bearer ${this.env.OUTLOOK_GRAPH_ACCESS_TOKEN}`,
      },
    });

    if (!response.ok) {
      throw new Error(`graph_fetch_message_failed:${response.status}`);
    }

    const payload = (await response.json()) as {
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
    };

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

  async recoverMessages(input: {
    mailbox: MailboxAccountFact;
    currentCursor: string | null;
  }): Promise<OutlookDeltaResult> {
    if (
      this.env.PHASE0_GRAPH_MODE === "mock" ||
      !this.env.OUTLOOK_GRAPH_ACCESS_TOKEN
    ) {
      return {
        messages: [buildMockMessage(input.mailbox, `recover-${Date.now()}`)],
        nextCursor: `mock-delta:${Date.now()}`,
        resetCursor: false,
      };
    }

    const url = input.currentCursor
      ? new URL(input.currentCursor)
      : new URL(
          `${this.env.GRAPH_BASE_URL ?? "https://graph.microsoft.com/v1.0"}/users/${encodeURIComponent(input.mailbox.graphUserId)}/mailFolders('Inbox')/messages/delta`,
        );

    const response = await fetch(url, {
      headers: {
        authorization: `Bearer ${this.env.OUTLOOK_GRAPH_ACCESS_TOKEN}`,
      },
    });

    if (!response.ok) {
      throw new Error(`graph_delta_failed:${response.status}`);
    }

    const payload = (await response.json()) as {
      value?: Array<{
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
      }>;
      "@odata.deltaLink"?: string;
      "@odata.nextLink"?: string;
    };

    return {
      messages:
        payload.value?.map((message) => ({
          id: message.id,
          internetMessageId: message.internetMessageId ?? null,
          subject: message.subject ?? "",
          fromAddress: message.from?.emailAddress?.address ?? null,
          toAddresses:
            message.toRecipients
              ?.map((recipient) => recipient.emailAddress?.address ?? null)
              .filter((value): value is string => Boolean(value)) ?? [],
          receivedAt: message.receivedDateTime ?? new Date().toISOString(),
          bodyPreview: message.bodyPreview ?? "",
          bodyHtml: message.body?.content ?? null,
          webLink: message.webLink ?? null,
          rawPayload: message,
        })) ?? [],
      nextCursor: payload["@odata.deltaLink"] ?? payload["@odata.nextLink"] ?? null,
      resetCursor: false,
    };
  }
}
