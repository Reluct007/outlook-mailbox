import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const MIGRATIONS_TABLE_SQL = `
  CREATE TABLE schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

function normalizeConnectionString(value) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function resolveMigrationConnectionConfig(env = process.env) {
  const mode = env.PHASE0_STORAGE_MODE ?? "memory";

  if (mode === "memory") {
    throw new Error(
      `migration_requires_postgres_mode: received PHASE0_STORAGE_MODE=${mode}`,
    );
  }

  if (mode !== "postgres") {
    throw new Error(`unsupported_storage_mode:${mode}`);
  }

  const envConnectionString = normalizeConnectionString(env.PHASE0_POSTGRES_URL);
  if (envConnectionString) {
    return {
      connectionString: envConnectionString,
      source: "env",
    };
  }

  const hyperdriveConnectionString = normalizeConnectionString(
    env.HYPERDRIVE_CONNECTION_STRING,
  );
  if (hyperdriveConnectionString) {
    return {
      connectionString: hyperdriveConnectionString,
      source: "hyperdrive",
    };
  }

  throw new Error(
    "missing_postgres_connection: set PHASE0_POSTGRES_URL or HYPERDRIVE_CONNECTION_STRING when PHASE0_STORAGE_MODE=postgres",
  );
}

export async function loadMigrationFiles(migrationsDir) {
  const entries = await readdir(migrationsDir, { withFileTypes: true });

  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const migrations = [];
  for (const fileName of files) {
    const filePath = path.join(migrationsDir, fileName);
    migrations.push({
      version: fileName,
      sql: await readFile(filePath, "utf8"),
    });
  }

  return migrations;
}

export async function applyMigrations({
  connectionString,
  migrationsDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../schema",
  ),
  ClientCtor = Client,
  logger = console,
}) {
  const client = new ClientCtor({ connectionString });
  await client.connect();

  try {
    const existingTable = await client.query(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'schema_migrations'
      `,
    );

    if (existingTable.rowCount === 0) {
      await client.query(MIGRATIONS_TABLE_SQL);
    }

    const appliedVersions = await client.query(
      "SELECT version FROM schema_migrations ORDER BY version ASC",
    );
    const applied = new Set(appliedVersions.rows.map((row) => row.version));
    const migrations = await loadMigrationFiles(migrationsDir);

    for (const migration of migrations) {
      if (applied.has(migration.version)) {
        logger.log(`skip ${migration.version}`);
        continue;
      }

      logger.log(`apply ${migration.version}`);
      await client.query("BEGIN");

      try {
        await client.query(migration.sql);
        await client.query(
          "INSERT INTO schema_migrations (version) VALUES ($1)",
          [migration.version],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}

export async function runMigrationCli() {
  const { connectionString } = resolveMigrationConnectionConfig(process.env);
  await applyMigrations({
    connectionString,
  });
}

const isMain = process.argv[1]
  ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
  : false;

if (isMain) {
  runMigrationCli().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "unknown_migration_failure",
    );
    process.exitCode = 1;
  });
}
