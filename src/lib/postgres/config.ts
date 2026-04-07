import type { HyperdriveBinding, Phase0Env, Phase0StorageMode } from "../types";

export interface PostgresConnectionConfig {
  connectionString: string;
  source: "env" | "hyperdrive";
}

interface PostgresConfigInput {
  PHASE0_STORAGE_MODE?: Phase0StorageMode;
  PHASE0_POSTGRES_URL?: string;
  HYPERDRIVE?: HyperdriveBinding;
}

function normalizeConnectionString(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function resolvePhase0StorageMode(
  input: Pick<PostgresConfigInput, "PHASE0_STORAGE_MODE">,
): Phase0StorageMode {
  return input.PHASE0_STORAGE_MODE ?? "memory";
}

export function resolvePostgresConnectionConfig(
  input: PostgresConfigInput,
): PostgresConnectionConfig | null {
  const mode = resolvePhase0StorageMode(input);

  if (mode === "memory") {
    return null;
  }

  if (mode !== "postgres") {
    throw new Error(`unsupported_storage_mode:${String(mode)}`);
  }

  const envConnectionString = normalizeConnectionString(input.PHASE0_POSTGRES_URL);
  if (envConnectionString) {
    return {
      connectionString: envConnectionString,
      source: "env",
    };
  }

  const hyperdriveConnectionString = normalizeConnectionString(
    input.HYPERDRIVE?.connectionString,
  );
  if (hyperdriveConnectionString) {
    return {
      connectionString: hyperdriveConnectionString,
      source: "hyperdrive",
    };
  }

  throw new Error(
    "missing_postgres_connection: set PHASE0_POSTGRES_URL or provide HYPERDRIVE.connectionString when PHASE0_STORAGE_MODE=postgres",
  );
}

export function assertPostgresConnectionConfig(
  env: Phase0Env,
): PostgresConnectionConfig {
  const config = resolvePostgresConnectionConfig(env);
  if (!config) {
    throw new Error(
      "postgres_connection_not_available_in_memory_mode: PHASE0_STORAGE_MODE=memory",
    );
  }

  return config;
}
