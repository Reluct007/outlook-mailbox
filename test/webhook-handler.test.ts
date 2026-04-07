import { createFactsRepository, resetMemoryFactsRepository } from "../src/lib/facts-repository";
import { resetMemoryBlobStore } from "../src/lib/blob-store";
import { handleRequest } from "../src/index";
import type { Phase0Env } from "../src/lib/types";
import { vi } from "vitest";

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
                ok: true,
                mailboxId: String(id),
                path: new URL(request.url).pathname,
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
    PHASE0_GRAPH_MODE: "mock",
    PHASE0_AUTH_MODE: "mock",
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

describe("handleRequest webhook ingress", () => {
  beforeEach(() => {
    resetMemoryFactsRepository();
    resetMemoryBlobStore();
  });

  it("支持 validationToken", async () => {
    const response = await handleRequest(
      new Request(
        "https://example.com/api/webhooks/outlook?validationToken=hello-token",
      ),
      createEnv(),
      createCtx(),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("hello-token");
  });

  it("会校验 clientState 并拒绝不匹配事件", async () => {
    const env = createEnv();
    const repository = createFactsRepository(env);

    await repository.upsertMailboxAccount({
      mailboxId: "mailbox-1",
      emailAddress: "ops@example.com",
    });
    await repository.upsertMailboxSubscription({
      mailboxId: "mailbox-1",
      subscriptionId: "sub-1",
      clientState: "expected-client-state",
      subscriptionVersion: 1,
      expirationDateTime: null,
    });

    const response = await handleRequest(
      new Request("https://example.com/api/webhooks/outlook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          value: [
            {
              subscriptionId: "sub-1",
              clientState: "wrong-client-state",
              changeType: "created",
              resourceData: {
                id: "message-1",
              },
            },
          ],
        }),
      }),
      env,
      createCtx(),
    );

    expect(response.status).toBe(202);
    const payload = (await response.json()) as {
      accepted: unknown[];
      rejected: Array<{ reason: string }>;
    };
    expect(payload.accepted).toHaveLength(0);
    expect(payload.rejected[0]?.reason).toBe("client_state_mismatch");
  });

  it("空 webhook payload 会返回 400", async () => {
    const response = await handleRequest(
      new Request("https://example.com/api/webhooks/outlook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          value: [],
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

  it("全部事件被拒绝时不会写入 blob store", async () => {
    const put = vi.fn(async () => undefined);
    const env = createEnv({
      MESSAGE_BLOB_BUCKET: {
        put,
      } as unknown as R2Bucket,
    });

    const response = await handleRequest(
      new Request("https://example.com/api/webhooks/outlook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          value: [
            {
              subscriptionId: "missing-subscription",
              clientState: "any-client-state",
              changeType: "created",
              resourceData: {
                id: "message-1",
              },
            },
          ],
        }),
      }),
      env,
      createCtx(),
    );

    expect(response.status).toBe(202);
    expect(put).not.toHaveBeenCalled();
  });
});
