import { parseMessageRules } from "../src/lib/parser";
import type { MessageFact } from "../src/lib/types";

function makeMessage(overrides: Partial<MessageFact> = {}): MessageFact {
  return {
    id: "message-1",
    mailboxId: "mailbox-1",
    internetMessageId: null,
    subject: "Verification code inside",
    fromAddress: "sender@example.com",
    toAddresses: ["ops@example.com"],
    receivedAt: "2026-04-07T00:00:00.000Z",
    preview: "",
    excerpt: "",
    bodyHtmlBlobKey: null,
    rawPayloadBlobKey: null,
    webLink: null,
    createdAt: "2026-04-07T00:00:00.000Z",
    updatedAt: "2026-04-07T00:00:00.000Z",
    ...overrides,
  };
}

describe("parseMessageRules", () => {
  it("支持 html-only verification code", () => {
    const result = parseMessageRules({
      message: makeMessage({
        subject: "Your code",
      }),
      bodyHtml: "<div>Your verification code is <b>654321</b></div>",
    });

    expect(result.matches.map((match) => match.ruleKind)).toContain(
      "verification_code",
    );
  });

  it("支持 reward / cashback / redeem 关键词", () => {
    const result = parseMessageRules({
      message: makeMessage({
        preview: "Redeem cashback rewards now",
      }),
      bodyHtml: null,
    });

    expect(result.matches.map((match) => match.ruleKind)).toEqual(
      expect.arrayContaining(["reward", "cashback", "redeem"]),
    );
  });

  it("会忽略 quoted text", () => {
    const result = parseMessageRules({
      message: makeMessage({
        preview: "Latest message only",
      }),
      bodyHtml:
        "<p>Nothing here</p><p>On yesterday someone wrote:</p><blockquote>verification code 111111</blockquote>",
    });

    expect(result.matches.map((match) => match.ruleKind)).not.toContain(
      "verification_code",
    );
  });
});
