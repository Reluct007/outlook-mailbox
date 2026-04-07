import { Buffer } from "node:buffer";
import type {
  ConnectIntent,
  OutlookOauthTokenSet,
  OutlookProfile,
  Phase0Env,
} from "./types";

const DEFAULT_OAUTH_AUTHORITY = "consumers";
const DEFAULT_OAUTH_SCOPES = [
  "offline_access",
  "openid",
  "profile",
  "email",
  "https://graph.microsoft.com/Mail.Read",
].join(" ");

interface OutlookOauthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authority: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string;
}

function normalizeEnvValue(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toBase64Url(value: ArrayBuffer): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function buildExpiry(expiresInSeconds: number): string {
  return new Date(Date.now() + expiresInSeconds * 1000).toISOString();
}

function ensurePositiveExpiresIn(value: number | string | undefined): number | null {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function resolveOutlookOauthConfig(env: Phase0Env): OutlookOauthConfig | null {
  const clientId = normalizeEnvValue(env.OUTLOOK_OAUTH_CLIENT_ID);
  const clientSecret = normalizeEnvValue(env.OUTLOOK_OAUTH_CLIENT_SECRET);
  const redirectUri = normalizeEnvValue(env.OUTLOOK_OAUTH_REDIRECT_URI);
  const authority =
    normalizeEnvValue(env.OUTLOOK_OAUTH_AUTHORITY) ?? DEFAULT_OAUTH_AUTHORITY;

  const authorizeUrl =
    normalizeEnvValue(env.OUTLOOK_OAUTH_AUTHORIZE_URL) ??
    `https://login.microsoftonline.com/${encodeURIComponent(authority)}/oauth2/v2.0/authorize`;
  const tokenUrl =
    normalizeEnvValue(env.OUTLOOK_OAUTH_TOKEN_URL) ??
    `https://login.microsoftonline.com/${encodeURIComponent(authority)}/oauth2/v2.0/token`;
  const scopes = normalizeEnvValue(env.OUTLOOK_OAUTH_SCOPES) ?? DEFAULT_OAUTH_SCOPES;

  if (!clientId || !clientSecret || !redirectUri || !authorizeUrl || !tokenUrl) {
    return null;
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    authority,
    authorizeUrl,
    tokenUrl,
    scopes,
  };
}

export async function createPkceCodeChallenge(
  codeVerifier: string,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(codeVerifier),
  );
  return toBase64Url(digest);
}

export function createRandomOAuthToken(bytes = 32): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return toBase64Url(buffer.buffer);
}

export async function buildOutlookAuthorizeUrl(input: {
  env: Phase0Env;
  intent: ConnectIntent;
}): Promise<string> {
  const oauthConfig = resolveOutlookOauthConfig(input.env);
  if (!oauthConfig) {
    throw new Error("oauth_config_missing");
  }

  const url = new URL(oauthConfig.authorizeUrl);
  url.searchParams.set("client_id", oauthConfig.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", oauthConfig.redirectUri);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", oauthConfig.scopes);
  url.searchParams.set("state", input.intent.stateNonce);
  url.searchParams.set("code_challenge", await createPkceCodeChallenge(input.intent.pkceCodeVerifier));
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export async function exchangeAuthorizationCode(input: {
  env: Phase0Env;
  code: string;
  codeVerifier: string;
}): Promise<OutlookOauthTokenSet> {
  const oauthConfig = resolveOutlookOauthConfig(input.env);
  if (!oauthConfig) {
    throw new Error("oauth_config_missing");
  }

  const body = new URLSearchParams({
    client_id: oauthConfig.clientId,
    client_secret: oauthConfig.clientSecret,
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: oauthConfig.redirectUri,
    code_verifier: input.codeVerifier,
    scope: oauthConfig.scopes,
  });

  const response = await fetch(oauthConfig.tokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number | string;
        error?: string;
        error_description?: string;
      }
    | null;

  if (!response.ok) {
    throw new Error(payload?.error ?? `oauth_authorization_code_exchange_failed:${response.status}`);
  }

  const accessToken = payload?.access_token;
  const expiresIn = ensurePositiveExpiresIn(payload?.expires_in);
  if (!accessToken || expiresIn === null) {
    throw new Error("oauth_authorization_code_exchange_invalid_response");
  }

  return {
    accessToken,
    refreshToken: payload?.refresh_token ?? null,
    tokenExpiresAt: buildExpiry(expiresIn),
  };
}

export async function refreshOutlookAccessToken(input: {
  env: Phase0Env;
  refreshToken: string;
}): Promise<OutlookOauthTokenSet> {
  const oauthConfig = resolveOutlookOauthConfig(input.env);
  if (!oauthConfig) {
    throw new Error("oauth_config_missing");
  }

  const body = new URLSearchParams({
    client_id: oauthConfig.clientId,
    client_secret: oauthConfig.clientSecret,
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
    scope: oauthConfig.scopes,
  });

  const response = await fetch(oauthConfig.tokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number | string;
        error?: string;
        error_description?: string;
      }
    | null;

  if (!response.ok) {
    throw new Error(payload?.error ?? `oauth_refresh_failed:${response.status}`);
  }

  const accessToken = payload?.access_token;
  const expiresIn = ensurePositiveExpiresIn(payload?.expires_in);
  if (!accessToken || expiresIn === null) {
    throw new Error("oauth_refresh_invalid_response");
  }

  return {
    accessToken,
    refreshToken: payload?.refresh_token ?? input.refreshToken,
    tokenExpiresAt: buildExpiry(expiresIn),
  };
}

export async function fetchOutlookProfile(input: {
  env: Phase0Env;
  accessToken: string;
}): Promise<OutlookProfile> {
  const graphBaseUrl = input.env.GRAPH_BASE_URL ?? "https://graph.microsoft.com/v1.0";
  const response = await fetch(new URL(`${graphBaseUrl}/me`), {
    headers: {
      authorization: `Bearer ${input.accessToken}`,
    },
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        id?: string | null;
        mail?: string | null;
        userPrincipalName?: string | null;
        displayName?: string | null;
      }
    | null;

  if (!response.ok) {
    throw new Error(`graph_me_failed:${response.status}`);
  }

  const providerAccountId = payload?.id?.trim();
  const emailAddress =
    payload?.mail?.trim() || payload?.userPrincipalName?.trim() || null;

  if (!providerAccountId || !emailAddress) {
    throw new Error("graph_me_missing_identity");
  }

  return {
    providerAccountId,
    emailAddress,
    graphUserId: providerAccountId,
    displayName: payload?.displayName?.trim() || null,
  };
}
