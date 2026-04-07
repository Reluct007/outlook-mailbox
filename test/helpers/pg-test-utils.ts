import { readFile } from "node:fs/promises";
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
  const schemaUrl = new URL("../../schema/0001_phase0.sql", import.meta.url);
  return readFile(fileURLToPath(schemaUrl), "utf8");
}

export async function applyPhase0Schema(context: PgMemContext): Promise<void> {
  const schemaSql = await readPhase0SchemaSql();
  await withClient(context, async (client) => {
    await client.query(schemaSql);
  });
}
