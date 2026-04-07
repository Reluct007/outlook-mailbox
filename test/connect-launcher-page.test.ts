import { handleRequest } from "../src/index";
import type { Phase0Env } from "../src/lib/types";

function createEnv(): Phase0Env {
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
    PHASE0_OPERATOR_USERNAME: "operator",
    PHASE0_OPERATOR_PASSWORD: "test-password",
  };
}

function createOperatorHeaders(): Record<string, string> {
  return {
    authorization: "Basic " + btoa("operator:test-password"),
  };
}

function createCtx(): ExecutionContext {
  return {
    waitUntil() {},
    passThroughOnException() {},
    props: {},
  };
}

describe("connect launcher page", () => {
  it("授权发起页返回 html，并包含通用 connect-intent 发起脚本", async () => {
    const response = await handleRequest(
      new Request("https://example.com/connect/outlook", {
        headers: createOperatorHeaders(),
      }),
      createEnv(),
      createCtx(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = await response.text();
    expect(body).toContain("Outlook 授权发起");
    expect(body).toContain("不预绑定邮箱");
    expect(body).toContain("/api/mailboxes/connect-intents");
    expect(body).toContain("copy-api-button");
  });

  it("授权发起页未授权时返回 401 basic auth challenge", async () => {
    const response = await handleRequest(
      new Request("https://example.com/connect/outlook"),
      createEnv(),
      createCtx(),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Basic");
  });
});
