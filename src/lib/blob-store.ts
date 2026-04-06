import type { Phase0Env } from "./types";

interface BlobStore {
  putJson(key: string, value: unknown): Promise<void>;
  getJson<T>(key: string): Promise<T | null>;
  putText(key: string, value: string): Promise<void>;
  getText(key: string): Promise<string | null>;
}

declare global {
  // eslint-disable-next-line no-var
  var __phase0BlobStore: Map<string, string> | undefined;
}

function getMemoryBlobStore(): Map<string, string> {
  globalThis.__phase0BlobStore ??= new Map<string, string>();
  return globalThis.__phase0BlobStore;
}

class MemoryBlobStore implements BlobStore {
  async putJson(key: string, value: unknown): Promise<void> {
    getMemoryBlobStore().set(key, JSON.stringify(value));
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = getMemoryBlobStore().get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async putText(key: string, value: string): Promise<void> {
    getMemoryBlobStore().set(key, value);
  }

  async getText(key: string): Promise<string | null> {
    return getMemoryBlobStore().get(key) ?? null;
  }
}

class R2BlobStore implements BlobStore {
  constructor(private readonly bucket: R2Bucket) {}

  async putJson(key: string, value: unknown): Promise<void> {
    await this.bucket.put(key, JSON.stringify(value), {
      httpMetadata: {
        contentType: "application/json; charset=utf-8",
      },
    });
  }

  async getJson<T>(key: string): Promise<T | null> {
    const object = await this.bucket.get(key);
    if (!object) {
      return null;
    }

    return (await object.json()) as T;
  }

  async putText(key: string, value: string): Promise<void> {
    await this.bucket.put(key, value, {
      httpMetadata: {
        contentType: "text/plain; charset=utf-8",
      },
    });
  }

  async getText(key: string): Promise<string | null> {
    const object = await this.bucket.get(key);
    if (!object) {
      return null;
    }

    return await object.text();
  }
}

export function createBlobStore(env: Phase0Env): BlobStore {
  if (env.MESSAGE_BLOB_BUCKET) {
    return new R2BlobStore(env.MESSAGE_BLOB_BUCKET);
  }

  return new MemoryBlobStore();
}

export function resetMemoryBlobStore(): void {
  getMemoryBlobStore().clear();
}
