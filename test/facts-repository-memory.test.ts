import { createFactsRepository, resetMemoryFactsRepository } from "../src/lib/facts-repository";
import type { Phase0Env } from "../src/lib/types";

function createEnv(): Phase0Env {
  return {
    MAILBOX_COORDINATOR: {} as DurableObjectNamespace,
    MAIL_FETCH_QUEUE: {} as Queue<any>,
    MAIL_PARSE_QUEUE: {} as Queue<any>,
    MAIL_RECOVER_QUEUE: {} as Queue<any>,
    SUBSCRIPTION_RENEW_QUEUE: {} as Queue<any>,
    PHASE0_STORAGE_MODE: "memory",
    PHASE0_GRAPH_MODE: "mock",
    PHASE0_AUTH_MODE: "mock",
  };
}

describe("memory facts repository", () => {
  afterEach(() => {
    resetMemoryFactsRepository();
  });

  it("订阅续期后旧 subscriptionId 不再可解析", async () => {
    const repository = createFactsRepository(createEnv());

    await repository.upsertMailboxAccount({
      mailboxId: "mailbox-1",
      emailAddress: "ops@example.com",
    });

    await repository.upsertMailboxSubscription({
      mailboxId: "mailbox-1",
      subscriptionId: "sub-1",
      clientState: "state-1",
      subscriptionVersion: 1,
      expirationDateTime: null,
    });
    await repository.upsertMailboxSubscription({
      mailboxId: "mailbox-1",
      subscriptionId: "sub-2",
      clientState: "state-2",
      subscriptionVersion: 2,
      expirationDateTime: null,
    });

    expect(await repository.resolveMailboxBySubscriptionId("sub-1")).toBeNull();
    expect(await repository.resolveMailboxBySubscriptionId("sub-2")).toMatchObject({
      mailboxId: "mailbox-1",
      subscriptionId: "sub-2",
    });
  });
});
