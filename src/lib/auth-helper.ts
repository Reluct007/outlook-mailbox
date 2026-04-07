import type { FactsRepository } from "./facts-repository";
import type { MailboxAccountFact, Phase0Env, RefreshTokenResult } from "./types";
import { refreshOutlookAccessToken, resolveOutlookOauthConfig } from "./outlook-oauth";

const ACCESS_TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;

export class OutlookAuthHelper {
  constructor(
    private readonly env: Phase0Env,
    private readonly repository: FactsRepository,
  ) {}

  private hasUsableAccessToken(input: {
    accessToken: string | null;
    tokenExpiresAt: string | null;
  }): boolean {
    if (!input.accessToken) {
      return false;
    }

    if (!input.tokenExpiresAt) {
      return true;
    }

    const expiresAt = new Date(input.tokenExpiresAt).getTime();
    if (Number.isNaN(expiresAt)) {
      return false;
    }

    return expiresAt - Date.now() > ACCESS_TOKEN_REFRESH_SKEW_MS;
  }

  async getMailboxAccessToken(
    mailbox: MailboxAccountFact,
  ): Promise<RefreshTokenResult> {
    const credential = await this.repository.getMailboxCredential(mailbox.mailboxId);

    if (
      credential &&
      this.hasUsableAccessToken({
        accessToken: credential.accessToken,
        tokenExpiresAt: credential.tokenExpiresAt,
      })
    ) {
      return {
        ok: true,
        reauthRequired: false,
        accessToken: credential.accessToken,
        tokenExpiresAt: credential.tokenExpiresAt,
        error: null,
      };
    }

    return this.refreshMailboxAccessToken(mailbox, credential);
  }

  async refreshMailboxAccessToken(
    mailbox: MailboxAccountFact,
    existingCredential?: {
      accessToken: string | null;
      refreshToken: string | null;
      tokenExpiresAt: string | null;
    } | null,
  ): Promise<RefreshTokenResult> {
    const credential =
      existingCredential ??
      (await this.repository.getMailboxCredential(mailbox.mailboxId));

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

    const oauthConfig = resolveOutlookOauthConfig(this.env);
    if (!oauthConfig) {
      return {
        ok: false,
        reauthRequired: false,
        accessToken: null,
        tokenExpiresAt: null,
        error: "oauth_refresh_config_missing",
      };
    }

    try {
      const result = await refreshOutlookAccessToken({
        env: this.env,
        refreshToken: credential.refreshToken,
      });

      await this.repository.upsertMailboxCredential({
        mailboxId: mailbox.mailboxId,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken ?? credential.refreshToken,
        tokenExpiresAt: result.tokenExpiresAt,
      });

      return {
        ok: true,
        reauthRequired: false,
        accessToken: result.accessToken,
        tokenExpiresAt: result.tokenExpiresAt,
        error: null,
      };
    } catch (error) {
      const oauthError =
        error instanceof Error ? error.message : "oauth_refresh_unknown_error";
      const reauthRequired =
        oauthError === "invalid_grant" ||
        oauthError === "interaction_required" ||
        oauthError === "login_required";

      return {
        ok: false,
        reauthRequired,
        accessToken: null,
        tokenExpiresAt: null,
        error: oauthError,
      };
    }
  }
}
