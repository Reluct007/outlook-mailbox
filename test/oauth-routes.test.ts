import { Buffer } from "node:buffer";
import { createFactsRepository, resetMemoryFactsRepository } from "../src/lib/facts-repository";
import { handleRequest } from "../src/index";
import type { Phase0Env } from "../src/lib/types";

const TEST_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");

function createEnv(overrides: Partial<Phase0Env> = {}): Phase0Env {
  return {
    MAILBOX_COORDINATOR: {
      idFromName(name: string) {
        return name as unknown as DurableObjectId;
      },
      get(id: DurableObjectId) {
        return {
          async fetch(request: Request) {
            return new Response(
              JSON.stringify({
                mailboxId: String(id),
                path: new URL(request.url).pathname,
              }),
              {
                status: 201,
                headers: {
                  "content-type": "application/json",
                },
              },
            );
          },
        } as DurableObjectStub;
      },
    } as DurableObjectNamespace,
    MAIL_FETCH_QUEUE: {
      send: async () => undefined,
      sendBatch: async () => undefined,
    } as unknown as Queue<any>,
    MAIL_PARSE_QUEUE: {
      send: async () => undefined,
      sendBatch: async () => undefined,
    } as unknown as Queue<any>,
    MAIL_RECOVER_QUEUE: {
      send: async () => undefined,
      sendBatch: async () => undefined,
    } as unknown as Queue<any>,
    SUBSCRIPTION_RENEW_QUEUE: {
      send: async () => undefined,
      sendBatch: async () => undefined,
    } as unknown as Queue<any>,
    PHASE0_STORAGE_MODE: "memory",
    PHASE0_GRAPH_MODE: "real",
    PHASE0_AUTH_MODE: "real",
    OUTLOOK_OAUTH_CLIENT_ID: "client-id",
    OUTLOOK_OAUTH_CLIENT_SECRET: "client-secret",
    OUTLOOK_OAUTH_REDIRECT_URI: "https://example.com/oauth/outlook/callback",
    OUTLOOK_OAUTH_AUTHORITY: "consumers",
    OUTLOOK_CREDENTIAL_ENCRYPTION_KEY: TEST_CREDENTIAL_ENCRYPTION_KEY,
    ...overrides,
  };
}

function createCtx(): ExecutionContext {
  return {
    waitUntil() {},
    passThroughOnException() {},
    props: {},
  };
}

describe("OAuth routes", () => {
  beforeEach(() => {
    resetMemoryFactsRepository();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("connect-intents 会返回 intentId 和 startUrl，start 路由会 302 到 Microsoft", async () => {
    const env = createEnv();
    const response = await handleRequest(
      new Request("https://example.com/api/mailboxes/connect-intents", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          mailboxLabel: "ops-mailbox",
        }),
      }),
      env,
      createCtx(),
    );

    expect(response.status).toBe(201);
    const payload = (await response.json()) as {
      intentId: string;
      startUrl: string;
    };
    expect(payload.intentId).toBeTruthy();
    expect(payload.startUrl).toContain("/oauth/outlook/start?intentId=");

    const startResponse = await handleRequest(
      new Request(payload.startUrl),
      env,
      createCtx(),
    );

    expect(startResponse.status).toBe(302);
    expect(startResponse.headers.get("location")).toContain(
      "login.microsoftonline.com/consumers/oauth2/v2.0/authorize",
    );
  });

  it("callback 成功后会落库 mailbox/credential 并跳转到结果页", async () => {
    const env = createEnv();
    const createResponse = await handleRequest(
      new Request("https://example.com/api/mailboxes/connect-intents", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      }),
      env,
      createCtx(),
    );
    const createPayload = (await createResponse.json()) as { intentId: string };
    const repository = createFactsRepository(env);
    const intent = await repository.getConnectIntentById(createPayload.intentId);
    expect(intent).not.toBeNull();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "access-token-1",
            refresh_token: "refresh-token-1",
            expires_in: 3600,
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "provider-1",
            mail: "ops@example.com",
            displayName: "Ops",
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

    const callbackResponse = await handleRequest(
      new Request(
        `https://example.com/oauth/outlook/callback?state=${encodeURIComponent(intent!.stateNonce)}&code=code-1`,
      ),
      env,
      createCtx(),
    );

    expect(callbackResponse.status).toBe(302);
    expect(callbackResponse.headers.get("location")).toContain(
      `/connect/result?intentId=${createPayload.intentId}`,
    );

    const mailbox = await repository.getMailboxAccount("provider-1");
    const credential = await repository.getMailboxCredential("provider-1");
    const completedIntent = await repository.getConnectIntentById(createPayload.intentId);

    expect(mailbox).toMatchObject({
      mailboxId: "provider-1",
      emailAddress: "ops@example.com",
      providerAccountId: "provider-1",
      authStatus: "active",
    });
    expect(credential).toMatchObject({
      accessToken: "access-token-1",
      refreshToken: "refresh-token-1",
    });
    expect(completedIntent).toMatchObject({
      status: "completed",
      targetMailboxId: "provider-1",
    });

    const resultResponse = await handleRequest(
      new Request(
        `https://example.com/connect/result?intentId=${encodeURIComponent(createPayload.intentId)}`,
      ),
      env,
      createCtx(),
    );

    expect(resultResponse.status).toBe(200);
    expect(await resultResponse.text()).toContain("授权成功，激活进行中");
  });

  it("callback 失败时会标记 intent failed", async () => {
    const env = createEnv();
    const createResponse = await handleRequest(
      new Request("https://example.com/api/mailboxes/connect-intents", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      }),
      env,
      createCtx(),
    );
    const createPayload = (await createResponse.json()) as { intentId: string };
    const repository = createFactsRepository(env);
    const intent = await repository.getConnectIntentById(createPayload.intentId);

    const callbackResponse = await handleRequest(
      new Request(
        `https://example.com/oauth/outlook/callback?state=${encodeURIComponent(intent!.stateNonce)}&error=access_denied`,
      ),
      env,
      createCtx(),
    );

    expect(callbackResponse.status).toBe(302);
    expect(
      (await repository.getConnectIntentById(createPayload.intentId))?.status,
    ).toBe("failed");
  });

  it("reauthorize 会把邮箱置为 pending_auth，并在 callback 成功后恢复 active", async () => {
    const env = createEnv();
    const repository = createFactsRepository(env);
    await repository.upsertMailboxAccount({
      mailboxId: "provider-1",
      emailAddress: "ops@example.com",
      graphUserId: "provider-1",
      providerAccountId: "provider-1",
      authStatus: "reauth_required",
    });
    await repository.upsertMailboxCredential({
      mailboxId: "provider-1",
      refreshToken: "refresh-token-old",
    });

    const startResponse = await handleRequest(
      new Request("https://example.com/api/mailboxes/provider-1/reauthorize", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          redirectAfter: "/mailboxes/provider-1",
        }),
      }),
      env,
      createCtx(),
    );
    expect(startResponse.status).toBe(201);
    expect((await repository.getMailboxAccount("provider-1"))?.authStatus).toBe(
      "pending_auth",
    );

    const payload = (await startResponse.json()) as { intentId: string };
    const intent = await repository.getConnectIntentById(payload.intentId);
    expect(intent).toMatchObject({
      mode: "reauth",
      targetMailboxId: "provider-1",
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "access-token-next",
            refresh_token: "refresh-token-next",
            expires_in: 3600,
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "provider-1",
            mail: "ops@example.com",
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

    const callbackResponse = await handleRequest(
      new Request(
        `https://example.com/oauth/outlook/callback?state=${encodeURIComponent(intent!.stateNonce)}&code=reauth-code-1`,
      ),
      env,
      createCtx(),
    );

    expect(callbackResponse.status).toBe(302);
    expect((await repository.getMailboxAccount("provider-1"))?.authStatus).toBe(
      "active",
    );
    expect((await repository.getMailboxCredential("provider-1"))).toMatchObject({
      accessToken: "access-token-next",
      refreshToken: "refresh-token-next",
    });

    const resultResponse = await handleRequest(
      new Request(
        `https://example.com/connect/result?intentId=${encodeURIComponent(payload.intentId)}`,
      ),
      env,
      createCtx(),
    );
    expect(await resultResponse.text()).toContain("重新授权成功");
  });

  it("reauthorize callback 失败时会把邮箱恢复到 reauth_required", async () => {
    const env = createEnv();
    const repository = createFactsRepository(env);
    await repository.upsertMailboxAccount({
      mailboxId: "provider-1",
      emailAddress: "ops@example.com",
      graphUserId: "provider-1",
      providerAccountId: "provider-1",
      authStatus: "reauth_required",
    });

    const startResponse = await handleRequest(
      new Request("https://example.com/api/mailboxes/provider-1/reauthorize", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      }),
      env,
      createCtx(),
    );
    const payload = (await startResponse.json()) as { intentId: string };
    const intent = await repository.getConnectIntentById(payload.intentId);

    await handleRequest(
      new Request(
        `https://example.com/oauth/outlook/callback?state=${encodeURIComponent(intent!.stateNonce)}&error=access_denied`,
      ),
      env,
      createCtx(),
    );

    expect((await repository.getConnectIntentById(payload.intentId))?.status).toBe(
      "failed",
    );
    expect((await repository.getMailboxAccount("provider-1"))?.authStatus).toBe(
      "reauth_required",
    );
  });

  it("旧的 public /api/mailboxes 路由已经不存在", async () => {
    const response = await handleRequest(
      new Request("https://example.com/api/mailboxes", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          mailboxId: "mailbox-1",
          emailAddress: "ops@example.com",
          refreshToken: "refresh-token-1",
        }),
      }),
      createEnv(),
      createCtx(),
    );

    expect(response.status).toBe(404);
  });
});
