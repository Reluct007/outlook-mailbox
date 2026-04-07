import { Client } from "pg";
import type { QueryResult, QueryResultRow } from "pg";
import type { PostgresConnectionConfig } from "./config";

export interface PostgresQueryable {
  query<TRow extends QueryResultRow = QueryResultRow>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<TRow>>;
}

export interface PostgresClientLike extends PostgresQueryable {
  connect(): Promise<unknown>;
  end(): Promise<void>;
}

export interface PostgresClientConstructor {
  new (config: { connectionString: string }): PostgresClientLike;
}

export interface PostgresDriver {
  query<TRow extends QueryResultRow = QueryResultRow>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<TRow>>;
  transaction<TResult>(
    run: (queryable: PostgresQueryable) => Promise<TResult>,
  ): Promise<TResult>;
}

interface CreatePostgresDriverOptions {
  ClientCtor?: PostgresClientConstructor;
}

async function withClient<TResult>(
  connectionString: string,
  ClientCtor: PostgresClientConstructor,
  run: (client: PostgresClientLike) => Promise<TResult>,
): Promise<TResult> {
  const client = new ClientCtor({ connectionString });
  await client.connect();

  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

export function createPostgresDriver(
  config: PostgresConnectionConfig,
  options: CreatePostgresDriverOptions = {},
): PostgresDriver {
  const ClientCtor = options.ClientCtor ?? Client;

  return {
    async query<TRow extends QueryResultRow = QueryResultRow>(
      sql: string,
      values: readonly unknown[] = [],
    ): Promise<QueryResult<TRow>> {
      return withClient(config.connectionString, ClientCtor, async (client) =>
        client.query<TRow>(sql, values),
      );
    },

    async transaction<TResult>(
      run: (queryable: PostgresQueryable) => Promise<TResult>,
    ): Promise<TResult> {
      return withClient(config.connectionString, ClientCtor, async (client) => {
        await client.query("BEGIN");

        try {
          const result = await run(client);
          await client.query("COMMIT");
          return result;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      });
    },
  };
}
