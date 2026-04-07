import { OutlookGraphClient } from "../src/lib/graph-client";
import type { MailboxAccountFact, Phase0Env } from "../src/lib/types";

function createEnv(overrides: Partial<Phase0Env> = {}): Phase0Env {
  return {
    MAILBOX_COORDINATOR: {} as DurableObjectNamespace,
    MAIL_FETCH_QUEUE: {} as Queue<any>,
    MAIL_PARSE_QUEUE: {} as Queue<any>,
    MAIL_RECOVER_QUEUE: {} as Queue<any>,
    SUBSCRIPTION_RENEW_QUEUE: {} as Queue<any>,
    PHASE0_STORAGE_MODE: "postgres",
    PHASE0_GRAPH_MODE: "real",
    PHASE0_AUTH_MODE: "real",
    GRAPH_BASE_URL: "https://graph.microsoft.com/v1.0",
    OUTLOOK_WEBHOOK_NOTIFICATION_URL:
      "https://worker.example.com/api/webhooks/outlook",
    ...overrides,
  };
}

function createMailbox(): MailboxAccountFact {
  return {
    mailboxId: "mailbox-1",
    emailAddress: "ops@example.com",
    graphUserId: "ops@example.com",
    providerAccountId: null,
    authStatus: "active",
    createdAt: "2026-04-07T00:00:00.000Z",
    updatedAt: "2026-04-07T00:00:00.000Z",
  };
}

describe("OutlookGraphClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("真实 subscription 使用 mailbox token 和显式 webhook callback URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "sub-1",
          expirationDateTime: "2026-04-07T01:00:00.000Z",
          clientState: "client-state-1",
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new OutlookGraphClient(createEnv());
    const result = await client.ensureSubscription({
      mailbox: createMailbox(),
      clientState: "client-state-1",
      accessToken: "mailbox-access-token",
    });

    expect(result).toMatchObject({
      subscriptionId: "sub-1",
      clientState: "client-state-1",
    });

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [
      URL,
      RequestInit,
    ];
    expect(requestUrl.toString()).toBe("https://graph.microsoft.com/v1.0/subscriptions");
    expect(requestInit.headers).toMatchObject({
      authorization: "Bearer mailbox-access-token",
      "content-type": "application/json",
    });

    const body = JSON.parse(String(requestInit.body)) as {
      notificationUrl: string;
      lifecycleNotificationUrl: string;
      resource: string;
    };
    expect(body.notificationUrl).toBe(
      "https://worker.example.com/api/webhooks/outlook",
    );
    expect(body.lifecycleNotificationUrl).toBe(
      "https://worker.example.com/api/webhooks/outlook",
    );
    expect(body.resource).toBe("/users/ops@example.com/mailFolders('Inbox')/messages");
  });

  it("真实模式缺 webhook callback URL 时快速失败", async () => {
    const client = new OutlookGraphClient(
      createEnv({
        OUTLOOK_WEBHOOK_NOTIFICATION_URL: "",
      }),
    );

    await expect(
      client.ensureSubscription({
        mailbox: createMailbox(),
        clientState: "client-state-1",
        accessToken: "mailbox-access-token",
      }),
    ).rejects.toThrow("outlook_webhook_notification_url_missing");
  });

  it("真实 fetchMessage 使用传入的 mailbox token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "message-1",
          subject: "Your verification code",
          bodyPreview: "111111",
          receivedDateTime: "2026-04-07T00:00:00.000Z",
          body: {
            content: "<p>111111</p>",
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new OutlookGraphClient(createEnv());
    await client.fetchMessage({
      mailbox: createMailbox(),
      messageId: "message-1",
      accessToken: "mailbox-access-token",
    });

    const [, requestInit] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(requestInit.headers).toMatchObject({
      authorization: "Bearer mailbox-access-token",
    });
  });
});
