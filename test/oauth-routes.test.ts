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
    PHASE0_OPERATOR_USERNAME: "operator",
    PHASE0_OPERATOR_PASSWORD: "test-password",
    ...overrides,
  };
}

function createOperatorHeaders(
  headers: Record<string, string> = {},
): Record<string, string> {
  return {
    authorization: "Basic " + btoa("operator:test-password"),
    ...headers,
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

  it("connect-intents 未授权时返回 401 basic auth challenge", async () => {
    const response = await handleRequest(
      new Request("https://example.com/api/mailboxes/connect-intents", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      }),
      createEnv(),
      createCtx(),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Basic");
  });

  it("connect-intents 会返回 intentId 和 startUrl，start 路由会 302 到 Microsoft", async () => {
    const env = createEnv();
    const response = await handleRequest(
      new Request("https://example.com/api/mailboxes/connect-intents", {
        method: "POST",
        headers: {
          ...createOperatorHeaders(),
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      }),
      env,
      createCtx(),
    );

    expect(response.status).toBe(201);
    const payload = (await response.json()) as {
      intentId: string;
      startUrl: string;
      resultUrl: string;
    };
    expect(payload.intentId).toBeTruthy();
    expect(payload.startUrl).toContain("/oauth/outlook/start?intentId=");
    expect(payload.resultUrl).toContain(`/connect/result?intentId=${payload.intentId}`);
    expect(response.headers.get("cache-control")).toBe("no-store");

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

  it("connect-intents 会拒绝非站内 redirectAfter", async () => {
    const response = await handleRequest(
      new Request("https://example.com/api/mailboxes/connect-intents", {
        method: "POST",
        headers: {
          ...createOperatorHeaders(),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          redirectAfter: "https://evil.example/steal",
        }),
      }),
      createEnv(),
      createCtx(),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "bad_request",
    });
  });

  it("connect-intents 非法 JSON 时返回 400", async () => {
    const response = await handleRequest(
      new Request("https://example.com/api/mailboxes/connect-intents", {
        method: "POST",
        headers: {
          ...createOperatorHeaders(),
          "content-type": "application/json",
        },
        body: "{",
      }),
      createEnv(),
      createCtx(),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "bad_request",
    });
  });

  it("connect-intents 缺少 assetId 时也可以创建通用授权 intent", async () => {
    const response = await handleRequest(
      new Request("https://example.com/api/mailboxes/connect-intents", {
        method: "POST",
        headers: {
          ...createOperatorHeaders(),
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      }),
      createEnv(),
      createCtx(),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      assetId: null,
      status: "pending",
      redirectAfter: "/connect/outlook",
    });
  });

  it("同一 assetId 的 connect-intent 默认复用当前未过期 intent，supersede 时才生成新的 intent", async () => {
    const env = createEnv();
    const firstResponse = await handleRequest(
      new Request("https://example.com/api/mailboxes/connect-intents", {
        method: "POST",
        headers: {
          ...createOperatorHeaders(),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          assetId: "provider-1",
        }),
      }),
      env,
      createCtx(),
    );
    expect(firstResponse.status).toBe(201);
    const firstPayload = (await firstResponse.json()) as { intentId: string };

    const secondResponse = await handleRequest(
      new Request("https://example.com/api/mailboxes/connect-intents", {
        method: "POST",
        headers: {
          ...createOperatorHeaders(),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          assetId: "provider-1",
        }),
      }),
      env,
      createCtx(),
    );
    expect(secondResponse.status).toBe(200);
    const secondPayload = (await secondResponse.json()) as { intentId: string; reused: boolean };
    expect(secondPayload.intentId).toBe(firstPayload.intentId);
    expect(secondPayload.reused).toBe(true);

    const thirdResponse = await handleRequest(
      new Request("https://example.com/api/mailboxes/connect-intents", {
        method: "POST",
        headers: {
          ...createOperatorHeaders(),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          assetId: "provider-1",
          supersedeCurrent: true,
        }),
      }),
      env,
      createCtx(),
    );
    expect(thirdResponse.status).toBe(201);
    const thirdPayload = (await thirdResponse.json()) as { intentId: string; reused: boolean };
    expect(thirdPayload.intentId).not.toBe(firstPayload.intentId);
    expect(thirdPayload.reused).toBe(false);

    const repository = createFactsRepository(env);
    expect((await repository.getConnectIntentById(firstPayload.intentId))?.status).toBe("expired");
    expect((await repository.getConnectIntentById(thirdPayload.intentId))?.status).toBe("pending");
  });

  it("可以按 assetId 读取当前未过期 intent", async () => {
    const env = createEnv();
    const createResponse = await handleRequest(
      new Request("https://example.com/api/mailboxes/connect-intents", {
        method: "POST",
        headers: {
          ...createOperatorHeaders(),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          assetId: "provider-1",
        }),
      }),
      env,
      createCtx(),
    );
    const createPayload = (await createResponse.json()) as { intentId: string };

    const currentResponse = await handleRequest(
      new Request("https://example.com/api/mailboxes/connect-intents?assetId=provider-1", {
        method: "GET",
        headers: createOperatorHeaders(),
      }),
      env,
      createCtx(),
    );

    expect(currentResponse.status).toBe(200);
    expect(currentResponse.headers.get("cache-control")).toBe("no-store");
    expect(await currentResponse.json()).toMatchObject({
      intent: {
        intentId: createPayload.intentId,
        assetId: "provider-1",
        status: "pending",
      },
    });
  });

  it("callback 成功后会落库 mailbox/credential 并跳转到结果页", async () => {
    const env = createEnv();
    const createResponse = await handleRequest(
      new Request("https://example.com/api/mailboxes/connect-intents", {
        method: "POST",
        headers: {
          ...createOperatorHeaders(),
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
        {
          headers: createOperatorHeaders(),
        },
      ),
      env,
      createCtx(),
    );

    expect(resultResponse.status).toBe(200);
    expect(resultResponse.headers.get("cache-control")).toBe("no-store");
    expect(await resultResponse.text()).toContain("授权成功，激活进行中");
  });

  it("callback 失败时会标记 intent failed", async () => {
    const env = createEnv();
    const createResponse = await handleRequest(
      new Request("https://example.com/api/mailboxes/connect-intents", {
        method: "POST",
        headers: {
          ...createOperatorHeaders(),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          assetId: "provider-1",
        }),
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

  it("connect callback 不再预先校验 assetId，实际登录的账号会被接管", async () => {
    const env = createEnv();
    const createResponse = await handleRequest(
      new Request("https://example.com/api/mailboxes/connect-intents", {
        method: "POST",
        headers: {
          ...createOperatorHeaders(),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          assetId: "asset-expected",
        }),
      }),
      env,
      createCtx(),
    );
    const createPayload = (await createResponse.json()) as { intentId: string };
    const repository = createFactsRepository(env);
    const intent = await repository.getConnectIntentById(createPayload.intentId);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "access-token-1",
            refresh_token: "refresh-token-1",
            expires_in: 3600,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "provider-1",
            mail: "ops@example.com",
            displayName: "Ops",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
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
    expect((await repository.getConnectIntentById(createPayload.intentId))?.status).toBe("completed");
    expect(await repository.getMailboxAccount("provider-1")).toMatchObject({
      mailboxId: "provider-1",
      emailAddress: "ops@example.com",
      providerAccountId: "provider-1",
      authStatus: "active",
    });
  });

  it("connect callback onboard 失败时不会把邮箱误报为 active", async () => {
    const env = createEnv({
      MAILBOX_COORDINATOR: {
        idFromName(name: string) {
          return name as unknown as DurableObjectId;
        },
        get(id: DurableObjectId) {
          return {
            async fetch(request: Request) {
              const path = new URL(request.url).pathname;
              if (path === "/commands/onboard") {
                return new Response("boom", { status: 500 });
              }

              return new Response(JSON.stringify({ mailboxId: String(id), path }), {
                status: 201,
                headers: {
                  "content-type": "application/json",
                },
              });
            },
          } as DurableObjectStub;
        },
      } as DurableObjectNamespace,
    });
    const createResponse = await handleRequest(
      new Request("https://example.com/api/mailboxes/connect-intents", {
        method: "POST",
        headers: {
          ...createOperatorHeaders(),
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

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "access-token-1",
            refresh_token: "refresh-token-1",
            expires_in: 3600,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "provider-1",
            mail: "ops@example.com",
            displayName: "Ops",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await handleRequest(
      new Request(
        `https://example.com/oauth/outlook/callback?state=${encodeURIComponent(intent!.stateNonce)}&code=code-1`,
      ),
      env,
      createCtx(),
    );

    expect((await repository.getConnectIntentById(createPayload.intentId))?.status).toBe("failed");
    expect((await repository.getMailboxAccount("provider-1"))?.authStatus).toBe("pending_auth");
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
        headers: createOperatorHeaders({
          "content-type": "application/json",
        }),
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
        {
          headers: createOperatorHeaders(),
        },
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
        headers: createOperatorHeaders({
          "content-type": "application/json",
        }),
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

  it("connect result 未授权时返回 401 basic auth challenge", async () => {
    const response = await handleRequest(
      new Request("https://example.com/connect/result?intentId=intent-1"),
      createEnv(),
      createCtx(),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Basic");
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
