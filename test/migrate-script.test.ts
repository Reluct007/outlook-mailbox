import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createPgMemContext, withClient } from "./helpers/pg-test-utils";

async function createTempMigrationDir(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "phase0-migrate-"));

  await Promise.all(
    Object.entries(files).map(([name, contents]) =>
      writeFile(path.join(dir, name), contents, "utf8"),
    ),
  );

  return dir;
}

describe("migrate script", () => {
  it("首次执行会应用 migration，重复执行会跳过已执行版本", async () => {
    // @ts-expect-error test-only dynamic import of the CLI module
    const { applyMigrations } = await import("../scripts/migrate.mjs");
    const context = createPgMemContext();
    const migrationsDir = await createTempMigrationDir({
      "0001_init.sql": `
        CREATE TABLE demo_items (id TEXT PRIMARY KEY);
      `,
    });
    const messages: string[] = [];

    try {
      await applyMigrations({
        connectionString: context.connectionString,
        migrationsDir,
        ClientCtor: context.ClientCtor,
        logger: {
          log(message: string) {
            messages.push(message);
          },
        },
      });

      await applyMigrations({
        connectionString: context.connectionString,
        migrationsDir,
        ClientCtor: context.ClientCtor,
        logger: {
          log(message: string) {
            messages.push(message);
          },
        },
      });

      await withClient(context, async (client) => {
        const applied = await client.query<{
          version: string;
        }>("SELECT version FROM schema_migrations ORDER BY version ASC");

        expect(applied.rows.map((row) => row.version)).toEqual(["0001_init.sql"]);
      });

      expect(messages).toEqual(["apply 0001_init.sql", "skip 0001_init.sql"]);
    } finally {
      await rm(migrationsDir, { recursive: true, force: true });
    }
  });

  it("按文件名顺序执行 migration", async () => {
    // @ts-expect-error test-only dynamic import of the CLI module
    const { applyMigrations } = await import("../scripts/migrate.mjs");
    const context = createPgMemContext();
    const migrationsDir = await createTempMigrationDir({
      "0002_second.sql": `
        INSERT INTO migration_order (name) VALUES ('second');
      `,
      "0001_first.sql": `
        CREATE TABLE migration_order (name TEXT NOT NULL);
        INSERT INTO migration_order (name) VALUES ('first');
      `,
    });

    try {
      await applyMigrations({
        connectionString: context.connectionString,
        migrationsDir,
        ClientCtor: context.ClientCtor,
        logger: { log() {} },
      });

      await withClient(context, async (client) => {
        const order = await client.query<{ name: string }>(
          "SELECT name FROM migration_order ORDER BY name ASC",
        );
        expect(order.rows.map((row) => row.name)).toEqual(["first", "second"]);
      });
    } finally {
      await rm(migrationsDir, { recursive: true, force: true });
    }
  });

  it("migration 失败时退出并且不会记录已应用版本", async () => {
    // @ts-expect-error test-only dynamic import of the CLI module
    const { applyMigrations } = await import("../scripts/migrate.mjs");
    const context = createPgMemContext();
    const migrationsDir = await createTempMigrationDir({
      "0001_ok.sql": `
        CREATE TABLE ok_table (id TEXT PRIMARY KEY);
      `,
      "0002_broken.sql": `
        CREATE TABLE broken_table (
      `,
    });

    try {
      await expect(
        applyMigrations({
          connectionString: context.connectionString,
          migrationsDir,
          ClientCtor: context.ClientCtor,
          logger: { log() {} },
        }),
      ).rejects.toThrow();

      await withClient(context, async (client) => {
        const applied = await client.query<{ version: string }>(
          "SELECT version FROM schema_migrations ORDER BY version ASC",
        );
        expect(applied.rows.map((row) => row.version)).toEqual(["0001_ok.sql"]);
      });
    } finally {
      await rm(migrationsDir, { recursive: true, force: true });
    }
  });
});
