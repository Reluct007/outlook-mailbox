import { createFactsRepository, resetMemoryFactsRepository } from "../src/lib/facts-repository";
import { dispatchQueueJob } from "../src/index";
import type { MailFetchJob, Phase0Env } from "../src/lib/types";

function createEnv(recordedRequests: Array<{ path: string; body: unknown }>): Phase0Env {
  return {
    MAILBOX_COORDINATOR: {
      idFromName(name: string) {
        return name as unknown as DurableObjectId;
      },
      get(id: DurableObjectId) {
        return {
          async fetch(request: Request) {
            const path = new URL(request.url).pathname;
            const body = request.method === "POST" ? await request.json() : null;
            recordedRequests.push({
              path,
              body: {
                mailboxId: String(id),
                payload: body,
              },
            });

            return new Response(
              JSON.stringify({
                ok: true,
                path,
              }),
              {
                status: 200,
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
  };
}

describe("dispatchQueueJob auth reporting", () => {
  afterEach(() => {
    resetMemoryFactsRepository();
  });

  it("mail.fetch 缺 refresh token 时会把 mailbox 推到 auth-failed 路径", async () => {
    const requests: Array<{ path: string; body: unknown }> = [];
    const env = createEnv(requests);
    const repository = createFactsRepository(env);

    await repository.upsertMailboxAccount({
      mailboxId: "mailbox-1",
      emailAddress: "ops@example.com",
    });

    const job: MailFetchJob = {
      kind: "mail.fetch",
      mailboxId: "mailbox-1",
      messageId: "message-1",
      rawPayloadKey: null,
      source: "webhook",
      enqueuedAt: "2026-04-07T00:00:00.000Z",
      versions: {
        subscriptionVersion: 1,
        recoveryGeneration: 0,
        cursorGeneration: 0,
      },
    };

    await expect(dispatchQueueJob(job, env)).rejects.toThrow("missing_refresh_token");

    expect(requests).toContainEqual({
      path: "/jobs/auth-failed",
      body: {
        mailboxId: "mailbox-1",
        payload: {
          reauthRequired: true,
          errorSummary: "missing_refresh_token",
        },
      },
    });
  });
});
