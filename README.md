# outlook-mailbox

Cloudflare-native Phase 0 skeleton for the Outlook mailbox hit-stream experiment.

## Current implementation

- Worker ingress
  - `POST /api/mailboxes`
  - `POST /api/webhooks/outlook`
  - `GET /api/hits`
  - `GET /api/messages/:id`
  - `GET /api/mailboxes/:id`
  - `POST /api/mailboxes/:id/recovery`
- Durable Object mailbox coordinator
  - lifecycle state owner
  - version gate
  - dedupe window
  - recovery / renew coordination
- Queue jobs
  - `mail.fetch`
  - `mail.parse`
  - `mail.recover`
  - `subscription.renew`
- Postgres facts repository
  - `memory` and `postgres` storage modes
  - file-based SQL migration entrypoint
- R2/blob split with graceful fallback
- Minimal parser
  - verification code
  - reward
  - cashback
  - redeem

## Storage modes

### `memory`

Current default is Phase 0 local validation mode:

- `PHASE0_STORAGE_MODE=memory`
- `PHASE0_GRAPH_MODE=mock`
- `PHASE0_AUTH_MODE=mock`

That means:

- facts are stored in memory for local/test runs
- Graph calls are mocked
- auth refresh is mocked

Use `memory` when you want:

- the lightest local validation loop
- mock Graph/auth behavior
- no Postgres dependency for quick tests

### `postgres`

`PHASE0_STORAGE_MODE=postgres` enables the real facts path.

Facts are stored in Postgres, while:

- Durable Objects remain the only mailbox lifecycle coordinator
- R2 continues to hold blob content
- repository callers keep the same API surface

Postgres connection config is canonicalized to a single `connectionString` shape:

1. preferred: `PHASE0_POSTGRES_URL`
2. runtime alternative: `HYPERDRIVE.connectionString` via a Hyperdrive binding named `HYPERDRIVE`

Migration CLI uses environment variables, so it accepts:

1. `PHASE0_POSTGRES_URL`
2. or `HYPERDRIVE_CONNECTION_STRING`

## Migration

Apply the schema with a single command:

```bash
PHASE0_STORAGE_MODE=postgres \
PHASE0_POSTGRES_URL="postgres://user:pass@host:5432/outlook_mailbox" \
npm run migrate
```

Behavior:

- creates `schema_migrations` if needed
- applies `schema/*.sql` in filename order
- skips already-applied versions
- exits non-zero on failure

Runtime code never auto-creates tables or auto-runs migrations. `scripts/migrate.mjs` is the only schema change entrypoint.

## Runtime config

Direct Postgres URL:

```bash
PHASE0_STORAGE_MODE=postgres
PHASE0_POSTGRES_URL=postgres://user:pass@host:5432/outlook_mailbox
```

Worker runtime with Hyperdrive:

```toml
compatibility_flags = ["nodejs_compat"]

# [[hyperdrive]]
# binding = "HYPERDRIVE"
# id = "<your-hyperdrive-id>"
```

The worker normalizes Hyperdrive to the same internal `connectionString` contract. It does not maintain a separate repository config path.

The production convergence target is now:

- Postgres for facts
- R2 for blobs
- Durable Objects for mailbox coordination

## Commands

```bash
npm install
npm run migrate
npm run typecheck
npm test
npm run dev
```

## Next production-hardening steps

1. wire real Graph subscription / message / delta APIs
2. wire real auth refresh flow
3. add queue backlog and latency metrics export
4. add integration/E2E runs against a real mailbox cohort
