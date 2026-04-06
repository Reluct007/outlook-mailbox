import type { FactsRepository } from "./facts-repository";
import type { MailboxAccountFact, Phase0Env, RefreshTokenResult } from "./types";

export class OutlookAuthHelper {
  constructor(
    private readonly env: Phase0Env,
    private readonly repository: FactsRepository,
  ) {}

  async refreshMailboxAccessToken(
    mailbox: MailboxAccountFact,
  ): Promise<RefreshTokenResult> {
    const credential = await this.repository.getMailboxCredential(mailbox.mailboxId);

    if (!credential?.refreshToken) {
      return {
        ok: false,
        reauthRequired: true,
        accessToken: null,
        tokenExpiresAt: null,
        error: "missing_refresh_token",
      };
    }

    if (this.env.PHASE0_AUTH_MODE === "mock") {
      const tokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const accessToken = `mock-access-token:${mailbox.mailboxId}:${Date.now()}`;

      await this.repository.upsertMailboxCredential({
        mailboxId: mailbox.mailboxId,
        accessToken,
        refreshToken: credential.refreshToken,
        tokenExpiresAt,
      });

      return {
        ok: true,
        reauthRequired: false,
        accessToken,
        tokenExpiresAt,
        error: null,
      };
    }

    return {
      ok: false,
      reauthRequired: true,
      accessToken: null,
      tokenExpiresAt: null,
      error: "refresh_token_flow_not_configured",
    };
  }
}
