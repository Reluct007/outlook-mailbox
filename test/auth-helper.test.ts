import { Buffer } from "node:buffer";
import { createFactsRepository, resetMemoryFactsRepository } from "../src/lib/facts-repository";
import { OutlookAuthHelper } from "../src/lib/auth-helper";
import type { MailboxAccountFact, Phase0Env } from "../src/lib/types";

const TEST_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

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
    OUTLOOK_OAUTH_AUTHORITY: "consumers",
    OUTLOOK_OAUTH_REDIRECT_URI: "https://example.com/oauth/outlook/callback",
    OUTLOOK_CREDENTIAL_ENCRYPTION_KEY: TEST_CREDENTIAL_ENCRYPTION_KEY,
    ...overrides,
  };
}

async function seedMailbox(env: Phase0Env): Promise<{
  helper: OutlookAuthHelper;
  mailbox: MailboxAccountFact;
  repository: ReturnType<typeof createFactsRepository>;
}> {
  const repository = createFactsRepository(env);
  const mailbox = await repository.upsertMailboxAccount({
    mailboxId: "mailbox-1",
    emailAddress: "ops@example.com",
  });
  const helper = new OutlookAuthHelper(env, repository);

  return {
    helper,
    mailbox,
    repository,
  };
}

describe("OutlookAuthHelper", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetMemoryFactsRepository();
  });

  it("优先复用未过期的 mailbox access token", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const env = createEnv();
    const { helper, mailbox, repository } = await seedMailbox(env);
    await repository.upsertMailboxCredential({
      mailboxId: mailbox.mailboxId,
      accessToken: "cached-access-token",
      refreshToken: "refresh-token-1",
      tokenExpiresAt: "2026-04-08T00:00:00.000Z",
    });

    const result = await helper.getMailboxAccessToken(mailbox);

    expect(result).toMatchObject({
      ok: true,
      reauthRequired: false,
      accessToken: "cached-access-token",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("会按 mailbox refresh token 调用真实 OAuth refresh 并回写 credential", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
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
    );
    vi.stubGlobal("fetch", fetchMock);

    const env = createEnv({
      OUTLOOK_OAUTH_TOKEN_URL: "https://login.example.test/oauth2/v2.0/token",
      OUTLOOK_OAUTH_SCOPES:
        "offline_access https://graph.microsoft.com/Mail.Read",
    });
    const { helper, mailbox, repository } = await seedMailbox(env);
    await repository.upsertMailboxCredential({
      mailboxId: mailbox.mailboxId,
      refreshToken: "refresh-token-1",
      tokenExpiresAt: "2026-04-07T00:00:00.000Z",
    });

    const result = await helper.refreshMailboxAccessToken(mailbox);
    const stored = await repository.getMailboxCredential(mailbox.mailboxId);

    expect(result.ok).toBe(true);
    expect(result.accessToken).toBe("access-token-next");
    expect(stored).toMatchObject({
      accessToken: "access-token-next",
      refreshToken: "refresh-token-next",
    });

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(requestUrl).toBe("https://login.example.test/oauth2/v2.0/token");
    expect(requestInit.method).toBe("POST");
    expect(requestInit.headers).toMatchObject({
      "content-type": "application/x-www-form-urlencoded",
    });
    expect(String(requestInit.body)).toContain("grant_type=refresh_token");
    expect(String(requestInit.body)).toContain("refresh_token=refresh-token-1");
    expect(String(requestInit.body)).toContain(
      "scope=offline_access+https%3A%2F%2Fgraph.microsoft.com%2FMail.Read",
    );
  });

  it("invalid_grant 会收敛为 reauthRequired", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "invalid_grant",
          error_description: "refresh token expired",
        }),
        {
          status: 400,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const env = createEnv();
    const { helper, mailbox, repository } = await seedMailbox(env);
    await repository.upsertMailboxCredential({
      mailboxId: mailbox.mailboxId,
      refreshToken: "refresh-token-1",
    });

    const result = await helper.refreshMailboxAccessToken(mailbox);

    expect(result).toMatchObject({
      ok: false,
      reauthRequired: true,
      error: "invalid_grant",
    });
  });
});
