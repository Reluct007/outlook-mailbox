import { Buffer } from "node:buffer";
import { afterEach, beforeEach, vi } from "vitest";
import { createCredentialCrypto } from "../src/lib/credential-crypto";
import { createPostgresFactsRepository } from "../src/lib/postgres/repository";
import { parseMessageRules } from "../src/lib/parser";
import type { MessageFact, Phase0Env } from "../src/lib/types";
import {
  applyPhase0Schema,
  createPgMemContext,
  withClient,
} from "./helpers/pg-test-utils";

const TEST_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 11).toString("base64");

function createEnv(overrides: Partial<Phase0Env> = {}): Phase0Env {
  return {
    MAILBOX_COORDINATOR: {} as DurableObjectNamespace,
    MAIL_FETCH_QUEUE: {} as Queue<any>,
    MAIL_PARSE_QUEUE: {} as Queue<any>,
    MAIL_RECOVER_QUEUE: {} as Queue<any>,
    SUBSCRIPTION_RENEW_QUEUE: {} as Queue<any>,
    PHASE0_STORAGE_MODE: "memory",
    PHASE0_GRAPH_MODE: "mock",
    PHASE0_AUTH_MODE: "mock",
    ...overrides,
  };
}

function makeMessage(overrides: Partial<MessageFact> = {}): MessageFact {
  return {
    id: "message-1",
    mailboxId: "mailbox-1",
    internetMessageId: null,
    subject: "Your verification code",
    fromAddress: "sender@example.com",
    toAddresses: ["ops@example.com"],
    receivedAt: "2026-04-07T00:00:00.000Z",
    preview: "verification code 111111",
    excerpt: "verification code 111111",
    bodyHtmlBlobKey: null,
    rawPayloadBlobKey: null,
    webLink: null,
    createdAt: "2026-04-07T00:00:00.000Z",
    updatedAt: "2026-04-07T00:00:00.000Z",
    ...overrides,
  };
}

describe("postgres facts repository", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock("pg");
  });

  it("upsertMailboxCredential 不会用 undefined 覆盖旧值", async () => {
    const context = createPgMemContext();
    await applyPhase0Schema(context);
    const repository = createPostgresFactsRepository(
      {
        connectionString: context.connectionString,
        source: "env",
      },
      {
        ClientCtor: context.ClientCtor,
        credentialCrypto: createCredentialCrypto({
          OUTLOOK_CREDENTIAL_ENCRYPTION_KEY: TEST_CREDENTIAL_ENCRYPTION_KEY,
          PHASE0_AUTH_MODE: "real",
        }),
      },
    );

    await repository.upsertMailboxAccount({
      mailboxId: "mailbox-1",
      emailAddress: "ops@example.com",
    });
    await repository.upsertMailboxCredential({
      mailboxId: "mailbox-1",
      accessToken: "access-token-1",
      refreshToken: "refresh-token-1",
      tokenExpiresAt: "2026-04-08T00:00:00.000Z",
    });

    const updated = await repository.upsertMailboxCredential({
      mailboxId: "mailbox-1",
      refreshToken: "refresh-token-2",
    });

    expect(updated).toMatchObject({
      mailboxId: "mailbox-1",
      provider: "outlook",
      accessToken: "access-token-1",
      refreshToken: "refresh-token-2",
      tokenExpiresAt: "2026-04-08T00:00:00.000Z",
    });

    await withClient(context, async (client) => {
      const rawResult = await client.query<{
        access_token: string | null;
        refresh_token: string | null;
      }>(
        `SELECT access_token, refresh_token FROM mailbox_credentials WHERE mailbox_id = 'mailbox-1'`,
      );
      expect(rawResult.rows[0]?.access_token).not.toBe("access-token-1");
      expect(rawResult.rows[0]?.refresh_token).not.toBe("refresh-token-2");
      expect(rawResult.rows[0]?.refresh_token).toMatch(/^enc:v1:/);
    });
  });

  it("可以创建并完成 connect intent，同时回写 mailbox auth status", async () => {
    const context = createPgMemContext();
    await applyPhase0Schema(context);
    const repository = createPostgresFactsRepository(
      {
        connectionString: context.connectionString,
        source: "env",
      },
      {
        ClientCtor: context.ClientCtor,
        credentialCrypto: createCredentialCrypto({
          OUTLOOK_CREDENTIAL_ENCRYPTION_KEY: TEST_CREDENTIAL_ENCRYPTION_KEY,
          PHASE0_AUTH_MODE: "real",
        }),
      },
    );

    const intent = await repository.createConnectIntent({
      mode: "connect",
      mailboxLabel: "ops-mailbox",
      redirectAfter: "/done",
      expiresAt: "2026-04-08T00:00:00.000Z",
      stateNonce: "state-1",
      pkceCodeVerifier: "verifier-1",
    });

    expect(
      await repository.getConnectIntentByStateNonce("state-1"),
    ).toMatchObject({
      id: intent.id,
      status: "pending",
      mailboxLabel: "ops-mailbox",
    });

    await repository.upsertMailboxAccount({
      mailboxId: "provider-1",
      emailAddress: "ops@example.com",
      graphUserId: "provider-1",
      providerAccountId: "provider-1",
      authStatus: "pending_auth",
    });

    const completed = await repository.completeConnectIntent({
      intentId: intent.id,
      targetMailboxId: "provider-1",
    });
    const updatedMailbox = await repository.updateMailboxAuthStatus(
      "provider-1",
      "active",
    );

    expect(completed).toMatchObject({
      status: "completed",
      targetMailboxId: "provider-1",
    });
    expect(updatedMailbox).toMatchObject({
      mailboxId: "provider-1",
      providerAccountId: "provider-1",
      authStatus: "active",
    });
  });

  it("saveParseArtifacts 会原子写入匹配、命中和 current signal", async () => {
    const context = createPgMemContext();
    await applyPhase0Schema(context);
    const repository = createPostgresFactsRepository(
      {
        connectionString: context.connectionString,
        source: "env",
      },
      {
        ClientCtor: context.ClientCtor,
      },
    );

    const message = makeMessage();
    await repository.upsertMailboxAccount({
      mailboxId: message.mailboxId,
      emailAddress: "ops@example.com",
    });
    await repository.saveMessage(message);

    const parsed = parseMessageRules({
      message,
      bodyHtml: null,
      now: "2026-04-07T00:00:01.000Z",
    });
    const saved = await repository.saveParseArtifacts(parsed);

    expect(saved.matches.map((match) => match.id)).toEqual([
      "message-1:verification_code",
    ]);
    expect(saved.hits.map((hit) => hit.id)).toEqual([
      "message-1:verification_code",
    ]);
    expect(saved.currentSignals).toMatchObject([
      {
        mailboxId: "mailbox-1",
        signalType: "verification_code",
        messageId: "message-1",
        matchedText: "111111",
        messageReceivedAt: "2026-04-07T00:00:00.000Z",
      },
    ]);

    expect(
      await repository.listCurrentSignals({
        signalType: "verification_code",
      }),
    ).toMatchObject([
      {
        mailboxId: "mailbox-1",
        signalType: "verification_code",
        matchedText: "111111",
      },
    ]);
  });

  it("saveParseArtifacts 通过 dedupe 保持幂等，duplicate replay 不改 current signal", async () => {
    const context = createPgMemContext();
    await applyPhase0Schema(context);
    const repository = createPostgresFactsRepository(
      {
        connectionString: context.connectionString,
        source: "env",
      },
      {
        ClientCtor: context.ClientCtor,
      },
    );

    const message = makeMessage();
    await repository.upsertMailboxAccount({
      mailboxId: message.mailboxId,
      emailAddress: "ops@example.com",
    });
    await repository.saveMessage(message);

    const firstParsed = parseMessageRules({
      message,
      bodyHtml: null,
      now: "2026-04-07T00:00:01.000Z",
    });
    const secondParsed = parseMessageRules({
      message,
      bodyHtml: null,
      now: "2026-04-07T00:05:00.000Z",
    });

    const first = await repository.saveParseArtifacts(firstParsed);
    const second = await repository.saveParseArtifacts(secondParsed);
    const currentSignals = await repository.listCurrentSignals({
      signalType: "verification_code",
    });

    expect(first.hits[0]?.id).toBe("message-1:verification_code");
    expect(second.hits[0]?.id).toBe("message-1:verification_code");
    expect(currentSignals[0]?.hitId).toBe("message-1:verification_code");
    expect(currentSignals[0]?.signalCreatedAt).toBe("2026-04-07T00:00:01.000Z");
  });

  it("saveParseArtifacts 不会让旧消息覆盖更新的 current signal", async () => {
    const context = createPgMemContext();
    await applyPhase0Schema(context);
    const repository = createPostgresFactsRepository(
      {
        connectionString: context.connectionString,
        source: "env",
      },
      {
        ClientCtor: context.ClientCtor,
      },
    );

    await repository.upsertMailboxAccount({
      mailboxId: "mailbox-1",
      emailAddress: "ops@example.com",
    });

    const newerMessage = makeMessage({
      id: "message-newer",
      receivedAt: "2026-04-07T01:00:00.000Z",
      preview: "verification code 222222",
      excerpt: "verification code 222222",
      createdAt: "2026-04-07T01:00:00.000Z",
      updatedAt: "2026-04-07T01:00:00.000Z",
    });
    const olderMessage = makeMessage({
      id: "message-older",
      receivedAt: "2026-04-07T00:00:00.000Z",
      preview: "verification code 111111",
      excerpt: "verification code 111111",
    });

    await repository.saveMessage(newerMessage);
    await repository.saveMessage(olderMessage);

    await repository.saveParseArtifacts(
      parseMessageRules({
        message: newerMessage,
        bodyHtml: null,
        now: "2026-04-07T01:00:01.000Z",
      }),
    );
    await repository.saveParseArtifacts(
      parseMessageRules({
        message: olderMessage,
        bodyHtml: null,
        now: "2026-04-07T01:05:00.000Z",
      }),
    );

    const currentSignals = await repository.listCurrentSignals({
      signalType: "verification_code",
    });
    expect(currentSignals[0]).toMatchObject({
      messageId: "message-newer",
      matchedText: "222222",
      messageReceivedAt: "2026-04-07T01:00:00.000Z",
    });
  });

  it("saveParseArtifacts 失败时会回滚整个事务", async () => {
    const context = createPgMemContext();
    await applyPhase0Schema(context);
    const repository = createPostgresFactsRepository(
      {
        connectionString: context.connectionString,
        source: "env",
      },
      {
        ClientCtor: context.ClientCtor,
      },
    );

    const message = makeMessage();
    await repository.upsertMailboxAccount({
      mailboxId: message.mailboxId,
      emailAddress: "ops@example.com",
    });
    await repository.saveMessage(message);

    const parsed = parseMessageRules({
      message,
      bodyHtml: null,
      now: "2026-04-07T00:00:01.000Z",
    });
    const [match] = parsed.matches;
    const [hit] = parsed.hits;
    if (!match || !hit) {
      throw new Error("expected_parsed_verification_code");
    }

    await expect(
      repository.saveParseArtifacts({
        matches: [match],
        hits: [
          {
            ...hit,
            ruleMatchId: "missing-match",
          },
        ],
      }),
    ).rejects.toThrow();

    const detail = await repository.getMessageDetail(message.id);
    expect(detail?.ruleMatches).toEqual([]);
    expect(detail?.hits).toEqual([]);
    expect(await repository.listCurrentSignals({})).toEqual([]);
    expect(
      await repository.listSignalHistory({
        signalType: "verification_code",
      }),
    ).toEqual([]);
  });

  it("listSignalHistory 返回按 receivedAt 排序的验证码历史", async () => {
    const context = createPgMemContext();
    await applyPhase0Schema(context);
    const repository = createPostgresFactsRepository(
      {
        connectionString: context.connectionString,
        source: "env",
      },
      {
        ClientCtor: context.ClientCtor,
      },
    );

    await repository.upsertMailboxAccount({
      mailboxId: "mailbox-1",
      emailAddress: "ops@example.com",
    });

    const olderMessage = makeMessage({
      id: "message-older",
      preview: "verification code 111111",
      excerpt: "verification code 111111",
      receivedAt: "2026-04-07T00:00:00.000Z",
    });
    const newerMessage = makeMessage({
      id: "message-newer",
      preview: "verification code 222222",
      excerpt: "verification code 222222",
      receivedAt: "2026-04-07T01:00:00.000Z",
      createdAt: "2026-04-07T01:00:00.000Z",
      updatedAt: "2026-04-07T01:00:00.000Z",
    });

    await repository.saveMessage(olderMessage);
    await repository.saveMessage(newerMessage);
    await repository.saveParseArtifacts(
      parseMessageRules({
        message: olderMessage,
        bodyHtml: null,
        now: "2026-04-07T00:00:01.000Z",
      }),
    );
    await repository.saveParseArtifacts(
      parseMessageRules({
        message: newerMessage,
        bodyHtml: null,
        now: "2026-04-07T01:00:01.000Z",
      }),
    );

    const history = await repository.listSignalHistory({
      signalType: "verification_code",
      limit: 10,
    });

    expect(history.map((entry) => entry.messageId)).toEqual([
      "message-newer",
      "message-older",
    ]);
  });

  it("getMailboxAggregates 返回聚合结果", async () => {
    const context = createPgMemContext();
    await applyPhase0Schema(context);
    const repository = createPostgresFactsRepository(
      {
        connectionString: context.connectionString,
        source: "env",
      },
      {
        ClientCtor: context.ClientCtor,
      },
    );

    const message = makeMessage({
      preview: "reward available",
      excerpt: "reward available",
    });
    await repository.upsertMailboxAccount({
      mailboxId: "mailbox-1",
      emailAddress: "ops@example.com",
    });
    await repository.saveMessage(message);
    await repository.saveParseArtifacts(
      parseMessageRules({
        message,
        bodyHtml: null,
        now: "2026-04-07T00:00:01.000Z",
      }),
    );

    expect(await repository.getMailboxAggregates("mailbox-1")).toEqual({
      mailboxId: "mailbox-1",
      totalMessages: 1,
      totalHits: 1,
      unprocessedHits: 1,
      latestMessageAt: "2026-04-07T00:00:00.000Z",
      latestHitAt: "2026-04-07T00:00:01.000Z",
    });
  });

  it("createFactsRepository 在 postgres 模式下返回可工作的 postgres repository", async () => {
    const context = createPgMemContext();
    await applyPhase0Schema(context);

    vi.doMock("pg", () => ({
      Client: context.ClientCtor,
    }));

    const { createFactsRepository } = await import("../src/lib/facts-repository");
    const repository = createFactsRepository(
      createEnv({
        PHASE0_STORAGE_MODE: "postgres",
        PHASE0_POSTGRES_URL: context.connectionString,
      }),
    );

    const mailbox = await repository.upsertMailboxAccount({
      mailboxId: "mailbox-1",
      emailAddress: "ops@example.com",
    });

    expect(mailbox).toMatchObject({
      mailboxId: "mailbox-1",
      emailAddress: "ops@example.com",
    });
  });
});
