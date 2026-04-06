import type {
  HitEventFact,
  MatchConfidence,
  MessageFact,
  MessageRuleMatchFact,
  RuleMatchKind,
} from "./types";

function stripHtml(input: string): string {
  return input
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<(?:br|\/p|\/div|\/blockquote|\/li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function stripQuotedText(input: string): string {
  const normalized = input
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith(">"))
    .join("\n");

  const markers = [
    /On .+ wrote:/i,
    /From:.+Sent:.+To:.+Subject:.+/i,
    /-{2,}\s*Original Message\s*-{2,}/i,
  ];

  for (const marker of markers) {
    const match = marker.exec(normalized);
    if (match && match.index !== undefined) {
      return normalized.slice(0, match.index).trim();
    }
  }

  return normalized.trim();
}

function buildSearchText(message: MessageFact, bodyHtml: string | null): string {
  return stripQuotedText(
    [message.subject, message.preview, message.excerpt, bodyHtml ? stripHtml(bodyHtml) : ""]
      .filter(Boolean)
      .join("\n"),
  );
}

function confidenceFromLength(value: string): MatchConfidence {
  return value.length >= 5 ? "high" : "medium";
}

function makeRuleMatch(
  message: MessageFact,
  ruleKind: RuleMatchKind,
  matchedText: string,
  reason: string,
  confidence: MatchConfidence,
  now = new Date().toISOString(),
): MessageRuleMatchFact {
  const safeText = matchedText.slice(0, 200);
  return {
    id: `${message.id}:${ruleKind}`,
    mailboxId: message.mailboxId,
    messageId: message.id,
    ruleKind,
    confidence,
    reason,
    matchedText: safeText,
    createdAt: now,
  };
}

function makeHit(match: MessageRuleMatchFact): HitEventFact {
  return {
    id: `${match.messageId}:${match.ruleKind}`,
    dedupeKey: `${match.mailboxId}:${match.messageId}:${match.ruleKind}`,
    mailboxId: match.mailboxId,
    messageId: match.messageId,
    ruleMatchId: match.id,
    hitType: match.ruleKind,
    confidence: match.confidence,
    processed: false,
    createdAt: match.createdAt,
  };
}

export function parseMessageRules(input: {
  message: MessageFact;
  bodyHtml: string | null;
  now?: string;
}): {
  matches: MessageRuleMatchFact[];
  hits: HitEventFact[];
} {
  const now = input.now ?? new Date().toISOString();
  const text = buildSearchText(input.message, input.bodyHtml);
  const matches: MessageRuleMatchFact[] = [];

  const verificationCodeMatch = text.match(
    /(?:verification(?:\s+code)?|passcode|otp|security\s+code|验证码)\D{0,20}(\d{4,8})/i,
  );

  if (verificationCodeMatch) {
    const verificationCode = verificationCodeMatch[1];
    if (verificationCode) {
    matches.push(
      makeRuleMatch(
        input.message,
        "verification_code",
        verificationCode,
        "matched verification code pattern",
        confidenceFromLength(verificationCode),
        now,
      ),
    );
    }
  }

  const keywordRules: Array<{
    kind: RuleMatchKind;
    pattern: RegExp;
    reason: string;
  }> = [
    {
      kind: "reward",
      pattern: /\breward(?:s)?\b/i,
      reason: "matched reward keyword",
    },
    {
      kind: "cashback",
      pattern: /\bcash\s*back\b|\bcashback\b/i,
      reason: "matched cashback keyword",
    },
    {
      kind: "redeem",
      pattern: /\bredeem(?:ed|ing)?\b/i,
      reason: "matched redeem keyword",
    },
  ];

  for (const rule of keywordRules) {
    const match = text.match(rule.pattern);
    if (!match) {
      continue;
    }

    matches.push(
      makeRuleMatch(
        input.message,
        rule.kind,
        match[0],
        rule.reason,
        "medium",
        now,
      ),
    );
  }

  const dedupedMatches = Array.from(
    new Map(matches.map((match) => [match.ruleKind, match])).values(),
  );

  return {
    matches: dedupedMatches,
    hits: dedupedMatches.map(makeHit),
  };
}
