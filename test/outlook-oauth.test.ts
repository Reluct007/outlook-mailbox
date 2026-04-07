import {
  buildOutlookAuthorizeUrl,
  fetchOutlookProfile,
} from "../src/lib/outlook-oauth";
import type { ConnectIntent, Phase0Env } from "../src/lib/types";

function createEnv(overrides: Partial<Phase0Env> = {}): Phase0Env {
  return {
    MAILBOX_COORDINATOR: {} as DurableObjectNamespace,
    MAIL_FETCH_QUEUE: {} as Queue<any>,
    MAIL_PARSE_QUEUE: {} as Queue<any>,
    MAIL_RECOVER_QUEUE: {} as Queue<any>,
    SUBSCRIPTION_RENEW_QUEUE: {} as Queue<any>,
    PHASE0_STORAGE_MODE: "memory",
    PHASE0_GRAPH_MODE: "real",
    PHASE0_AUTH_MODE: "real",
    OUTLOOK_OAUTH_CLIENT_ID: "client-id",
    OUTLOOK_OAUTH_CLIENT_SECRET: "client-secret",
    OUTLOOK_OAUTH_REDIRECT_URI: "https://example.com/oauth/outlook/callback",
    OUTLOOK_OAUTH_AUTHORITY: "consumers",
    ...overrides,
  };
}

function createIntent(): ConnectIntent {
  return {
    id: "intent-1",
    status: "pending",
    mode: "connect",
    mailboxLabel: null,
    targetMailboxId: null,
    stateNonce: "state-1",
    pkceCodeVerifier: "verifier-1",
    redirectAfter: null,
    expiresAt: "2026-04-08T00:00:00.000Z",
    completedAt: null,
    failureReason: null,
    createdAt: "2026-04-07T00:00:00.000Z",
    updatedAt: "2026-04-07T00:00:00.000Z",
  };
}

describe("outlook oauth helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("authorize url 会使用 consumers authority 和 state", async () => {
    const authorizeUrl = await buildOutlookAuthorizeUrl({
      env: createEnv(),
      intent: createIntent(),
    });

    const url = new URL(authorizeUrl);
    expect(url.origin + url.pathname).toBe(
      "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize",
    );
    expect(url.searchParams.get("state")).toBe("state-1");
    expect(url.searchParams.get("scope")).toContain(
      "https://graph.microsoft.com/Mail.Read",
    );
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("当 /me 缺少 mail 和 userPrincipalName 时会失败", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: "provider-1",
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      ),
    );

    await expect(
      fetchOutlookProfile({
        env: createEnv(),
        accessToken: "access-token-1",
      }),
    ).rejects.toThrow("graph_me_missing_identity");
  });
});
