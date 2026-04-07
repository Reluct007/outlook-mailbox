import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { newDb } from "pg-mem";
import type { PostgresClientConstructor, PostgresClientLike } from "../../src/lib/postgres/client";

const TEST_CONNECTION_STRING = "postgres://phase0:test@localhost:5432/outlook_mailbox";

export interface PgMemContext {
  ClientCtor: PostgresClientConstructor;
  connectionString: string;
}

export function createPgMemContext(): PgMemContext {
  const db = newDb({
    autoCreateForeignKeyIndices: true,
  });
  const adapter = db.adapters.createPg();

  return {
    ClientCtor: adapter.Client as unknown as PostgresClientConstructor,
    connectionString: TEST_CONNECTION_STRING,
  };
}

export async function withClient<TResult>(
  context: PgMemContext,
  run: (client: PostgresClientLike) => Promise<TResult>,
): Promise<TResult> {
  const client = new context.ClientCtor({
    connectionString: context.connectionString,
  });
  await client.connect();

  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

export async function readPhase0SchemaSql(): Promise<string> {
  const schemaDir = fileURLToPath(new URL("../../schema", import.meta.url));
  const entries = await readdir(schemaDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const sqlParts = await Promise.all(
    files.map((fileName) => readFile(path.join(schemaDir, fileName), "utf8")),
  );

  return sqlParts.join("\n\n");
}

export async function applyPhase0Schema(context: PgMemContext): Promise<void> {
  const schemaSql = await readPhase0SchemaSql();
  await withClient(context, async (client) => {
    await client.query(schemaSql);
  });
}
