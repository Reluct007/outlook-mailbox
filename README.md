# outlook-mailbox

Cloudflare-native Phase 0 skeleton for the Outlook mailbox hit-stream experiment.

## Current implementation

- Worker ingress
  - `POST /api/mailboxes/connect-intents`
  - `POST /api/mailboxes/:id/reauthorize`
  - `GET /oauth/outlook/start`
  - `GET /oauth/outlook/callback`
  - `GET /connect/result`
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
- Mailbox-scoped Graph auth path
  - credential source of truth lives in `mailbox_credentials`
  - real mode refreshes delegated tokens via OAuth refresh token flow
  - real mode subscription / fetch / delta calls use mailbox tokens, not a global Graph token
- R2/blob split with graceful fallback
- Minimal parser
  - verification code
  - reward
  - cashback
  - redeem

## Storage modes

### `memory`

Use `memory` when you explicitly want Phase 0 local validation mode:

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

`PHASE0_STORAGE_MODE=postgres` is the convergence target and the default runtime path in `wrangler.toml`.

Facts are stored in Postgres, while:

- Durable Objects remain the only mailbox lifecycle coordinator
- R2 continues to hold blob content
- repository callers keep the same API surface
- mailbox credentials persist in `mailbox_credentials`

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
- delegated mailbox OAuth refresh for Graph access

Notes:

- `OUTLOOK_OAUTH_AUTHORITY` defaults to `consumers`, which matches the current personal Outlook/Hotmail mailbox focus.
- `OUTLOOK_OAUTH_AUTHORIZE_URL` and `OUTLOOK_OAUTH_TOKEN_URL` are optional. If omitted, runtime derives the Microsoft endpoints from `OUTLOOK_OAUTH_AUTHORITY`.
- `OUTLOOK_CREDENTIAL_ENCRYPTION_KEY` is required for any path that persists or reads mailbox credentials. It must be a base64-encoded 32-byte key for AES-GCM.
- `OUTLOOK_WEBHOOK_NOTIFICATION_URL` is used for both `notificationUrl` and `lifecycleNotificationUrl`.
- Real Graph mode no longer reads a global `OUTLOOK_GRAPH_ACCESS_TOKEN`. The worker reads and refreshes credentials per mailbox.
- For local `wrangler dev`, put secrets in `.dev.vars` or export them in the shell before starting the worker.

## Mailbox onboarding

Public onboarding now goes through OAuth connect intents. Create an intent first:

```bash
curl -X POST "http://127.0.0.1:8787/api/mailboxes/connect-intents" \
  -H "content-type: application/json" \
  -d '{
    "mailboxLabel": "ops-mailbox",
    "redirectAfter": "/"
  }'
```

Then open the returned `startUrl` in a browser, finish Microsoft login/consent, and let the callback route persist:

- `mailbox_accounts`
- `mailbox_credentials`
- connect intent completion state
- async mailbox onboard / subscription renew

For an existing mailbox in `reauth_required`, use:

```bash
curl -X POST "http://127.0.0.1:8787/api/mailboxes/<mailbox-id>/reauthorize" \
  -H "content-type: application/json" \
  -d '{
    "redirectAfter": "/"
  }'
```

## Canary startup

Start with 1-3 real mailboxes only.

1. Apply schema:

```bash
PHASE0_STORAGE_MODE=postgres \
PHASE0_POSTGRES_URL="postgres://user:pass@host:5432/outlook_mailbox" \
npm run migrate
```

2. Export real runtime config or create `.dev.vars` from `.dev.vars.example`, then start the worker:

```bash
npm run dev
```

3. Create a connect intent and open the `startUrl` in a browser:

```bash
curl -X POST "http://127.0.0.1:8787/api/mailboxes/connect-intents" \
  -H "content-type: application/json" \
  -d '{
    "mailboxLabel": "ops-1",
    "redirectAfter": "/"
  }'
```

4. After callback lands, verify mailbox auth status, subscription + lifecycle state:

```bash
curl "http://127.0.0.1:8787/api/mailboxes/<mailbox-id>"
curl "http://127.0.0.1:8787/api/otp-panel"
```

5. Send a real OTP mail through the mailbox and watch the same endpoints until the panel shows the latest code.

## Canary observation points

- `GET /api/mailboxes/:id`
  - `mailbox.authStatus`
  - `state.lifecycleState`
  - `state.recentErrorSummary`
  - `subscription.expirationDateTime`
  - `cursor.deltaToken`
- `GET /api/otp-panel`
  - `status`
  - `primarySignal`
  - `mailboxes[].healthy`
  - `mailboxes[].recentErrorSummary`
- Facts/errors
  - `reauth_required`
  - `delivery_path_unhealthy`
  - renew failures
  - recovery triggers

## Known risks

- The current real path assumes delegated mailbox tokens. App-only token mode is still not implemented as a first-class model.
- Queue backlog / latency metrics are still operator-visible only through mailbox state and logs. There is no dedicated metrics export yet.
- Real webhook canary still depends on a publicly reachable `OUTLOOK_WEBHOOK_NOTIFICATION_URL`; local-only URLs will not work for Graph callbacks.
- Mailbox credential refresh is persisted, but there is no separate operator UI for credential rotation history yet.
- Credential storage inside `mailbox_credentials` is encrypted at the application layer with AES-GCM.

## Commands

```bash
npm install
npm run migrate
npm run typecheck
npm test
npm run dev
```

## Next production-hardening steps

1. add queue backlog and latency metrics export
2. add integration/E2E runs against a real mailbox cohort
3. add explicit operator surfacing for credential rotation history
4. decide whether app-only token mode is needed, or stay mailbox-delegated only
