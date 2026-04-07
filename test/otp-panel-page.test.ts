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
  };
}

function createCtx(): ExecutionContext {
  return {
    waitUntil() {},
    passThroughOnException() {},
    props: {},
  };
}

describe("otp panel page", () => {
  it("根路径返回 html 页面，并内置 otp panel 数据加载脚本", async () => {
    const response = await handleRequest(
      new Request("https://example.com/"),
      createEnv(),
      createCtx(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");

    const body = await response.text();
    expect(body).toContain("OTP Panel");
    expect(body).toContain("/api/otp-panel");
    expect(body).toContain("copy-button");
  });
});
