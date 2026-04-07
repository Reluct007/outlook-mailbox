import {
  resolvePhase0StorageMode,
  resolvePostgresConnectionConfig,
} from "../src/lib/postgres/config";

describe("postgres config", () => {
  it("memory 模式不要求 postgres 配置", () => {
    expect(
      resolvePostgresConnectionConfig({
        PHASE0_STORAGE_MODE: "memory",
      }),
    ).toBeNull();
    expect(
      resolvePhase0StorageMode({}),
    ).toBe("memory");
  });

  it("postgres 模式支持直接连接串", () => {
    expect(
      resolvePostgresConnectionConfig({
        PHASE0_STORAGE_MODE: "postgres",
        PHASE0_POSTGRES_URL: "postgres://user:pass@example.com:5432/phase0",
      }),
    ).toEqual({
      connectionString: "postgres://user:pass@example.com:5432/phase0",
      source: "env",
    });
  });

  it("postgres 模式支持 Hyperdrive 来源并归一化为同一 connectionString", () => {
    expect(
      resolvePostgresConnectionConfig({
        PHASE0_STORAGE_MODE: "postgres",
        HYPERDRIVE: {
          connectionString: "postgres://hyperdrive.example/phase0",
        },
      }),
    ).toEqual({
      connectionString: "postgres://hyperdrive.example/phase0",
      source: "hyperdrive",
    });
  });

  it("postgres 模式缺配置时快速失败", () => {
    expect(() =>
      resolvePostgresConnectionConfig({
        PHASE0_STORAGE_MODE: "postgres",
      }),
    ).toThrow("missing_postgres_connection");
  });
});
