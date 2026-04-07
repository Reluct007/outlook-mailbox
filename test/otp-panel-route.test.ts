import { createInitialMailboxSnapshot, transitionLifecycle } from "../src/lib/state-machine";
import { createFactsRepository, resetMemoryFactsRepository } from "../src/lib/facts-repository";
import { resetMemoryBlobStore } from "../src/lib/blob-store";
import { handleRequest } from "../src/index";
import { parseMessageRules } from "../src/lib/parser";
import type {
  MailboxCoordinatorSnapshot,
  MessageFact,
  Phase0Env,
} from "../src/lib/types";

function createEnv(
  snapshots: Record<string, MailboxCoordinatorSnapshot | null> = {},
): Phase0Env {
  return {
    MAILBOX_COORDINATOR: {
      idFromName(name: string) {
        return name as unknown as DurableObjectId;
      },
      get(id: DurableObjectId) {
        return {
          async fetch(request: Request) {
            const mailboxId = String(id);
            const path = new URL(request.url).pathname;
            if (path === "/snapshot") {
              const snapshot = snapshots[mailboxId] ?? null;
              if (!snapshot) {
                return new Response("not_found", { status: 404 });
              }

              return new Response(JSON.stringify(snapshot), {
                status: 200,
                headers: {
                  "content-type": "application/json",
                },
              });
            }

            return new Response(JSON.stringify({ ok: true, mailboxId, path }), {
              status: 200,
              headers: {
                "content-type": "application/json",
              },
            });
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
    PHASE0_GRAPH_MODE: "mock",
    PHASE0_AUTH_MODE: "mock",
  };
}

function createCtx(): ExecutionContext {
  return {
    waitUntil() {},
    passThroughOnException() {},
    props: {},
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

async function seedVerificationCode(
  env: Phase0Env,
  input: {
    mailboxId: string;
    emailAddress: string;
    code: string;
    receivedAt: string;
    createdAt: string;
    messageId: string;
  },
): Promise<void> {
  const repository = createFactsRepository(env);
  const message = makeMessage({
    id: input.messageId,
    mailboxId: input.mailboxId,
    toAddresses: [input.emailAddress],
    receivedAt: input.receivedAt,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    preview: `verification code ${input.code}`,
    excerpt: `verification code ${input.code}`,
  });

  await repository.upsertMailboxAccount({
    mailboxId: input.mailboxId,
    emailAddress: input.emailAddress,
  });
  await repository.saveMessage(message);
  await repository.saveParseArtifacts(
    parseMessageRules({
      message,
      bodyHtml: null,
      now: input.createdAt,
    }),
  );
}

describe("handleRequest otp panel", () => {
  beforeEach(() => {
    resetMemoryFactsRepository();
    resetMemoryBlobStore();
  });

  it("返回 latest-code-first 的 OTP 面板数据", async () => {
    const snapshots = {
      "mailbox-1": createInitialMailboxSnapshot("mailbox-1", "2026-04-07T00:00:00.000Z"),
      "mailbox-2": createInitialMailboxSnapshot("mailbox-2", "2026-04-07T00:00:00.000Z"),
    };
    const env = createEnv(snapshots);

    await seedVerificationCode(env, {
      mailboxId: "mailbox-1",
      emailAddress: "ops-1@example.com",
      code: "111111",
      receivedAt: "2026-04-07T00:00:00.000Z",
      createdAt: "2026-04-07T00:00:01.000Z",
      messageId: "message-1",
    });
    await seedVerificationCode(env, {
      mailboxId: "mailbox-2",
      emailAddress: "ops-2@example.com",
      code: "222222",
      receivedAt: "2026-04-07T01:00:00.000Z",
      createdAt: "2026-04-07T01:00:01.000Z",
      messageId: "message-2",
    });

    const response = await handleRequest(
      new Request("https://example.com/api/otp-panel"),
      env,
      createCtx(),
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      status: string;
      primarySignal: { value: string; mailboxId: string; acrossMailboxCount: number } | null;
      recentCodes: Array<{ value: string }>;
      summary: {
        currentVerificationCodeCount: number;
        unhealthyMailboxCount: number;
      };
    };

    expect(payload.status).toBe("ready");
    expect(payload.primarySignal).toMatchObject({
      value: "222222",
      mailboxId: "mailbox-2",
      acrossMailboxCount: 2,
    });
    expect(payload.recentCodes.map((entry) => entry.value)).toEqual(["111111"]);
    expect(payload.summary).toMatchObject({
      currentVerificationCodeCount: 2,
      unhealthyMailboxCount: 0,
    });
  });

  it("无验证码且链路健康时返回 waiting_for_code", async () => {
    const env = createEnv({
      "mailbox-1": createInitialMailboxSnapshot("mailbox-1", "2026-04-07T00:00:00.000Z"),
    });
    const repository = createFactsRepository(env);
    await repository.upsertMailboxAccount({
      mailboxId: "mailbox-1",
      emailAddress: "ops@example.com",
    });

    const response = await handleRequest(
      new Request("https://example.com/api/otp-panel"),
      env,
      createCtx(),
    );

    expect(response.status).toBe(200);
    expect((await response.json()) as { status: string }).toMatchObject({
      status: "waiting_for_code",
    });
  });

  it("无验证码且链路异常时返回 delivery_path_unhealthy", async () => {
    const unhealthySnapshot = transitionLifecycle(
      createInitialMailboxSnapshot("mailbox-1", "2026-04-07T00:00:00.000Z"),
      "recovery_needed",
      {
        now: "2026-04-07T00:10:00.000Z",
        errorSummary: "delta backlog",
      },
    ).snapshot;
    const env = createEnv({
      "mailbox-1": unhealthySnapshot,
    });
    const repository = createFactsRepository(env);
    await repository.upsertMailboxAccount({
      mailboxId: "mailbox-1",
      emailAddress: "ops@example.com",
    });

    const response = await handleRequest(
      new Request("https://example.com/api/otp-panel"),
      env,
      createCtx(),
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      status: string;
      summary: { unhealthyMailboxCount: number };
    };
    expect(payload).toMatchObject({
      status: "delivery_path_unhealthy",
      summary: {
        unhealthyMailboxCount: 1,
      },
    });
  });

  it("mixed 状态下仍然保持 ready，但会暴露异常 mailbox", async () => {
    const unhealthySnapshot = transitionLifecycle(
      createInitialMailboxSnapshot("mailbox-2", "2026-04-07T00:00:00.000Z"),
      "reauth_required",
      {
        now: "2026-04-07T00:10:00.000Z",
        errorSummary: "reauth required",
      },
    ).snapshot;
    const env = createEnv({
      "mailbox-1": createInitialMailboxSnapshot("mailbox-1", "2026-04-07T00:00:00.000Z"),
      "mailbox-2": unhealthySnapshot,
    });

    await seedVerificationCode(env, {
      mailboxId: "mailbox-1",
      emailAddress: "ops-1@example.com",
      code: "333333",
      receivedAt: "2026-04-07T01:00:00.000Z",
      createdAt: "2026-04-07T01:00:01.000Z",
      messageId: "message-1",
    });

    const repository = createFactsRepository(env);
    await repository.upsertMailboxAccount({
      mailboxId: "mailbox-2",
      emailAddress: "ops-2@example.com",
    });

    const response = await handleRequest(
      new Request("https://example.com/api/otp-panel"),
      env,
      createCtx(),
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      status: string;
      primarySignal: { value: string } | null;
      summary: { unhealthyMailboxCount: number };
    };
    expect(payload).toMatchObject({
      status: "ready",
      primarySignal: {
        value: "333333",
      },
      summary: {
        unhealthyMailboxCount: 1,
      },
    });
  });

  it("没有 mailbox 时返回 empty", async () => {
    const response = await handleRequest(
      new Request("https://example.com/api/otp-panel"),
      createEnv(),
      createCtx(),
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      status: string;
      summary: { mailboxCount: number };
    };
    expect(payload).toMatchObject({
      status: "empty",
      summary: {
        mailboxCount: 0,
      },
    });
  });
});
