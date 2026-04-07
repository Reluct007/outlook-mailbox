# outlook-mailbox

Experimental Cloudflare-native OTP aggregation panel for multiple Outlook mailboxes.

This project is optimized for one narrow workflow:

> get the latest verification code fast, copy it, and leave

It is not a general-purpose email client.

## Status

- experimental and self-host oriented
- current runtime target: Cloudflare Workers + Durable Objects + Queues + R2 + Postgres
- public ingress is intentionally narrow
- operator and read surfaces are intentionally protected

If you are evaluating whether this should be public yet, the answer is yes for source visibility and contribution, but you should still treat the runtime as an operator tool rather than a polished SaaS product.

## What It Does

- receives Outlook mailbox events through Microsoft Graph webhook callbacks
- coordinates mailbox lifecycle in a Durable Object
- stores facts and query models in Postgres
- stores larger message blobs in R2
- extracts OTP-oriented signals from mail content
- exposes a protected OTP/operator surface instead of a public dashboard

Primary signal:

- `verification_code`

Secondary signals:

- `reward`
- `cashback`
- `redeem`

## What It Does Not Do

- full mailbox management
- send mail
- anonymous public OTP viewing
- app-only Graph token mode as a first-class production path

## Architecture At A Glance

- public routes: Outlook OAuth callback and Graph webhook callback only
- protected routes: OTP panel, mailbox diagnostics, message detail, connect launcher, reauthorize, recovery
- lifecycle authority: Durable Object
- storage of record: Postgres
- blob storage: R2
- mailbox auth model: delegated mailbox OAuth refresh tokens

For deeper project context:

- product framing: [`docs/PRODUCT.md`](./docs/PRODUCT.md)
- implementation and runtime shape: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)
- current design notes: [`DESIGN.md`](./DESIGN.md)

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Create a local development config

Start from the example file:

```bash
cp .dev.vars.example .dev.vars
```

For the lightest local loop, replace its contents with:

```bash
PHASE0_STORAGE_MODE=memory
PHASE0_GRAPH_MODE=mock
PHASE0_AUTH_MODE=mock
PHASE0_OPERATOR_PASSWORD=dev-password
```

### 3. Start the worker

```bash
npm run dev
```

### 4. Verify the protected OTP route

```bash
curl -u "operator:dev-password" \
  "http://127.0.0.1:8787/api/otp-panel"
```

The worker requires `PHASE0_OPERATOR_PASSWORD` for protected routes even in local/mock mode.

## Real Runtime Configuration

The real runtime path needs all of the following:

```bash
PHASE0_STORAGE_MODE=postgres
PHASE0_POSTGRES_URL=postgres://user:pass@host:5432/outlook_mailbox
PHASE0_GRAPH_MODE=real
PHASE0_AUTH_MODE=real
OUTLOOK_WEBHOOK_NOTIFICATION_URL=https://<public-worker-host>/api/webhooks/outlook
OUTLOOK_WEBHOOK_CLIENT_STATE=<random-shared-secret>
OUTLOOK_OAUTH_CLIENT_ID=<azure-app-client-id>
OUTLOOK_OAUTH_CLIENT_SECRET=<azure-app-client-secret>
OUTLOOK_OAUTH_AUTHORITY=consumers
OUTLOOK_OAUTH_REDIRECT_URI=https://<public-worker-host>/oauth/outlook/callback
OUTLOOK_OAUTH_SCOPES="offline_access openid profile email https://graph.microsoft.com/Mail.Read"
OUTLOOK_CREDENTIAL_ENCRYPTION_KEY=<base64-encoded-32-byte-key>
PHASE0_OPERATOR_PASSWORD=<operator-basic-auth-password>
# optional, defaults to operator
# PHASE0_OPERATOR_USERNAME=operator
```

Notes:

- `PHASE0_POSTGRES_URL` is the preferred Postgres config path
- Hyperdrive can also be bound as `HYPERDRIVE`
- `OUTLOOK_OAUTH_AUTHORIZE_URL` and `OUTLOOK_OAUTH_TOKEN_URL` are optional overrides
- `OUTLOOK_CREDENTIAL_ENCRYPTION_KEY` is required anywhere mailbox credentials are persisted or read
- `redirectAfter` is intentionally restricted to same-site relative paths

## Migrations

Apply schema files in `schema/` with:

```bash
PHASE0_STORAGE_MODE=postgres \
PHASE0_POSTGRES_URL="postgres://user:pass@host:5432/outlook_mailbox" \
npm run migrate
```

Behavior:

- creates `schema_migrations` if needed
- applies SQL files in filename order
- skips versions that have already been applied
- exits non-zero on failure

Runtime code never auto-creates tables and never auto-runs migrations.

## Common Commands

```bash
npm run typecheck
npm test
npm run dev
npm run migrate
npm run deploy
```

## Security Model

This repository handles mailbox credentials and OTP-adjacent data, so the runtime boundary matters:

- operator surfaces require HTTP Basic auth
- webhook ingestion validates payload shape, subscription ownership, and `clientState`
- OAuth return targets are restricted to same-site relative paths
- mailbox credentials are encrypted at the application layer before persistence

See [`SECURITY.md`](./SECURITY.md) before testing against real accounts or opening a public issue about a vulnerability.

## Contributing

Contributions are welcome, but this is an intentionally opinionated codebase:

- keep changes focused
- prefer direct, readable solutions over compatibility layers
- add or update tests when behavior changes
- update docs when runtime config, routes, or storage contracts change

Read [`CONTRIBUTING.md`](./CONTRIBUTING.md) before opening a pull request.

## Known Gaps

- app-only Graph auth is not implemented as a first-class production path
- there is no dedicated metrics export for queue backlog or latency
- real webhook canary still requires a publicly reachable callback URL
- the operator surface is functional, but still optimized for self-hosted use rather than multi-tenant distribution

## License

MIT. See [`LICENSE`](./LICENSE).
