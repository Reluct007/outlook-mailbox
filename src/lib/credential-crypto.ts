import { Buffer } from "node:buffer";
import type { Phase0Env } from "./types";

const CREDENTIAL_ENCRYPTION_PREFIX = "enc:v1";
const AES_GCM_IV_BYTES = 12;

function normalizeEnvValue(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toBase64Url(buffer: Uint8Array): string {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return new Uint8Array(Buffer.from(normalized + padding, "base64"));
}

async function importAesKey(rawKey: string): Promise<CryptoKey> {
  const decodedKey = Buffer.from(rawKey, "base64");
  if (decodedKey.length !== 32) {
    throw new Error("credential_encryption_key_invalid_length");
  }

  return crypto.subtle.importKey(
    "raw",
    decodedKey,
    {
      name: "AES-GCM",
    },
    false,
    ["encrypt", "decrypt"],
  );
}

export interface CredentialCrypto {
  encrypt(value: string): Promise<string>;
  decrypt(value: string): Promise<string>;
}

class AesGcmCredentialCrypto implements CredentialCrypto {
  constructor(private readonly keyPromise: Promise<CryptoKey>) {}

  async encrypt(value: string): Promise<string> {
    const iv = new Uint8Array(AES_GCM_IV_BYTES);
    crypto.getRandomValues(iv);
    const encrypted = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
      },
      await this.keyPromise,
      new TextEncoder().encode(value),
    );

    return `${CREDENTIAL_ENCRYPTION_PREFIX}:${toBase64Url(iv)}:${toBase64Url(new Uint8Array(encrypted))}`;
  }

  async decrypt(value: string): Promise<string> {
    if (!value.startsWith(`${CREDENTIAL_ENCRYPTION_PREFIX}:`)) {
      throw new Error("credential_ciphertext_invalid_prefix");
    }

    const parts = value.split(":");
    if (parts.length !== 4) {
      throw new Error("credential_ciphertext_invalid");
    }

    const iv = fromBase64Url(parts[2] ?? "");
    const ciphertext = fromBase64Url(parts[3] ?? "");
    const ivBuffer = Uint8Array.from(iv).buffer;
    const ciphertextBuffer = Uint8Array.from(ciphertext).buffer;
    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: ivBuffer,
      },
      await this.keyPromise,
      ciphertextBuffer,
    );

    return new TextDecoder().decode(decrypted);
  }
}

export function createCredentialCrypto(
  env: Pick<Phase0Env, "OUTLOOK_CREDENTIAL_ENCRYPTION_KEY" | "PHASE0_AUTH_MODE">,
): CredentialCrypto | null {
  const rawKey = normalizeEnvValue(env.OUTLOOK_CREDENTIAL_ENCRYPTION_KEY);
  if (!rawKey) {
    return null;
  }

  return new AesGcmCredentialCrypto(importAesKey(rawKey));
}
