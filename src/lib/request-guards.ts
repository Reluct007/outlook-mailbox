import { badRequest, json, readJson, unauthorized } from "./http";
import type {
  CreateConnectIntentRequest,
  OutlookNotification,
  OutlookWebhookPayload,
  Phase0Env,
} from "./types";

const DEFAULT_OPERATOR_USERNAME = "operator";
const OPERATOR_REALM = "Outlook Mailbox Operator";
const MAX_ASSET_ID_LENGTH = 120;
const MAX_REDIRECT_AFTER_LENGTH = 2048;
const MAX_WEBHOOK_EVENT_COUNT = 100;
const MAX_NOTIFICATION_FIELD_LENGTH = 512;

function normalizeString(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function requireObject(
  value: unknown,
  message: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw badRequest(message);
  }

  return value as Record<string, unknown>;
}

function optionalTrimmedString(
  value: unknown,
  fieldName: string,
  maxLength: number,
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw badRequest(`${fieldName} must be a string`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw badRequest(`${fieldName} must not be empty`);
  }

  if (trimmed.length > maxLength) {
    throw badRequest(`${fieldName} must be at most ${maxLength} characters`);
  }

  return trimmed;
}

function optionalBoolean(
  value: unknown,
  fieldName: string,
): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw badRequest(`${fieldName} must be a boolean`);
  }

  return value;
}

function requiredTrimmedString(
  value: unknown,
  fieldName: string,
  maxLength: number,
): string {
  const parsed = optionalTrimmedString(value, fieldName, maxLength);
  if (!parsed) {
    throw badRequest(`${fieldName} is required`);
  }

  return parsed;
}

export async function readJsonObject(
  request: Request,
  invalidJsonMessage = "request body must be valid JSON",
): Promise<Record<string, unknown>> {
  return requireObject(await readJson(request, invalidJsonMessage), "request body must be a JSON object");
}

export function parseConnectIntentRequest(
  body: Record<string, unknown>,
): CreateConnectIntentRequest {
  const assetId =
    body.assetId === undefined
      ? undefined
      : optionalTrimmedString(
          body.assetId,
          "assetId",
          MAX_ASSET_ID_LENGTH,
        );
  const redirectAfter =
    body.redirectAfter === undefined
      ? undefined
      : parseRedirectAfter(body.redirectAfter);
  const supersedeCurrent = optionalBoolean(
    body.supersedeCurrent,
    "supersedeCurrent",
  );

  return {
    ...(assetId !== undefined ? { assetId } : {}),
    ...(redirectAfter !== undefined ? { redirectAfter } : {}),
    ...(supersedeCurrent !== undefined ? { supersedeCurrent } : {}),
  };
}

export function parseRedirectAfter(value: unknown): string {
  const trimmed = requiredTrimmedString(
    value,
    "redirectAfter",
    MAX_REDIRECT_AFTER_LENGTH,
  );

  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    throw badRequest("redirectAfter must be a relative path that starts with /");
  }

  if (/[\r\n]/.test(trimmed)) {
    throw badRequest("redirectAfter contains invalid characters");
  }

  const parsed = new URL(trimmed, "https://phase0.invalid");
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function parseNotification(
  value: unknown,
  index: number,
): OutlookNotification {
  const body = requireObject(
    value,
    `payload.value[${index}] must be a JSON object`,
  );

  const resourceDataValue = body.resourceData;
  const resourceData =
    resourceDataValue === undefined || resourceDataValue === null
      ? undefined
      : requireObject(
          resourceDataValue,
          `payload.value[${index}].resourceData must be an object`,
        );
  const changeType =
    body.changeType === undefined
      ? undefined
      : optionalTrimmedString(
          body.changeType,
          `payload.value[${index}].changeType`,
          MAX_NOTIFICATION_FIELD_LENGTH,
        );
  const lifecycleEvent =
    body.lifecycleEvent === undefined
      ? undefined
      : optionalTrimmedString(
          body.lifecycleEvent,
          `payload.value[${index}].lifecycleEvent`,
          MAX_NOTIFICATION_FIELD_LENGTH,
        );
  const resource =
    body.resource === undefined
      ? undefined
      : optionalTrimmedString(
          body.resource,
          `payload.value[${index}].resource`,
          MAX_NOTIFICATION_FIELD_LENGTH,
        );
  const resourceDataId =
    resourceData?.id === undefined
      ? undefined
      : optionalTrimmedString(
          resourceData.id,
          `payload.value[${index}].resourceData.id`,
          MAX_NOTIFICATION_FIELD_LENGTH,
        );
  const subscriptionExpirationDateTime =
    body.subscriptionExpirationDateTime === undefined
      ? undefined
      : optionalTrimmedString(
          body.subscriptionExpirationDateTime,
          `payload.value[${index}].subscriptionExpirationDateTime`,
          MAX_NOTIFICATION_FIELD_LENGTH,
        );

  return {
    subscriptionId: requiredTrimmedString(
      body.subscriptionId,
      `payload.value[${index}].subscriptionId`,
      MAX_NOTIFICATION_FIELD_LENGTH,
    ),
    clientState: requiredTrimmedString(
      body.clientState,
      `payload.value[${index}].clientState`,
      MAX_NOTIFICATION_FIELD_LENGTH,
    ),
    ...(changeType !== undefined ? { changeType } : {}),
    ...(lifecycleEvent !== undefined ? { lifecycleEvent } : {}),
    ...(resource !== undefined ? { resource } : {}),
    ...(resourceDataId !== undefined ? { resourceData: { id: resourceDataId } } : {}),
    ...(subscriptionExpirationDateTime !== undefined
      ? { subscriptionExpirationDateTime }
      : {}),
  };
}

export function parseWebhookPayload(
  body: Record<string, unknown>,
): OutlookWebhookPayload {
  if (!Array.isArray(body.value)) {
    throw badRequest("payload.value must be a non-empty array");
  }

  if (body.value.length === 0) {
    throw badRequest("payload.value must be a non-empty array");
  }

  if (body.value.length > MAX_WEBHOOK_EVENT_COUNT) {
    throw badRequest(
      `payload.value must contain at most ${MAX_WEBHOOK_EVENT_COUNT} notifications`,
    );
  }

  return {
    value: body.value.map((item, index) => parseNotification(item, index)),
  };
}

export function parseBooleanQuery(
  value: string | null,
  fieldName: string,
): boolean | undefined {
  if (value === null) {
    return undefined;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw badRequest(`${fieldName} must be true or false`);
}

export function parseLimitQuery(
  value: string | null,
  input: {
    fieldName?: string;
    fallback?: number;
    max?: number;
  } = {},
): number {
  const fieldName = input.fieldName ?? "limit";
  const fallback = input.fallback ?? 50;
  const max = input.max ?? 200;

  if (value === null) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw badRequest(`${fieldName} must be an integer between 1 and ${max}`);
  }

  return parsed;
}

export function decodePathParam(
  value: string | undefined,
  fieldName: string,
): string {
  try {
    return requiredTrimmedString(
      decodeURIComponent(value ?? ""),
      fieldName,
      MAX_REDIRECT_AFTER_LENGTH,
    );
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }

    throw badRequest(`${fieldName} is invalid`);
  }
}

function unauthorizedOperatorResponse(message: string): Response {
  return unauthorized(message, {
    headers: {
      "www-authenticate": `Basic realm="${OPERATOR_REALM}"`,
    },
  });
}

function decodeBasicAuthHeader(headerValue: string): {
  username: string;
  password: string;
} | null {
  if (!headerValue.startsWith("Basic ")) {
    return null;
  }

  try {
    const decoded = atob(headerValue.slice("Basic ".length));
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex < 0) {
      return null;
    }

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch {
    return null;
  }
}

export function isProtectedOperatorPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/index.html" ||
    pathname === "/connect/outlook" ||
    pathname === "/connect/result" ||
    pathname === "/api/mailboxes/connect-intents" ||
    pathname === "/api/hits" ||
    pathname === "/api/otp-panel" ||
    /^\/api\/messages\/[^/]+$/.test(pathname) ||
    /^\/api\/mailboxes\/[^/]+(?:\/(?:reauthorize|recovery))?$/.test(pathname)
  );
}

export function requireOperatorAuthorization(
  request: Request,
  env: Pick<Phase0Env, "PHASE0_OPERATOR_USERNAME" | "PHASE0_OPERATOR_PASSWORD">,
): Response | null {
  const expectedPassword = normalizeString(env.PHASE0_OPERATOR_PASSWORD);
  if (!expectedPassword) {
    return json(
      {
        error: "server_error",
        message: "operator password is not configured",
      },
      { status: 500 },
    );
  }

  const expectedUsername =
    normalizeString(env.PHASE0_OPERATOR_USERNAME) ?? DEFAULT_OPERATOR_USERNAME;
  const credentials = decodeBasicAuthHeader(
    request.headers.get("authorization") ?? "",
  );

  if (!credentials) {
    return unauthorizedOperatorResponse("operator_auth_required");
  }

  if (
    credentials.username !== expectedUsername ||
    credentials.password !== expectedPassword
  ) {
    return unauthorizedOperatorResponse("operator_auth_invalid");
  }

  return null;
}
