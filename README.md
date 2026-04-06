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
- R2/blob split with graceful fallback
- Minimal parser
  - verification code
  - reward
  - cashback
  - redeem

## Local mode

Current default is Phase 0 local validation mode:

- `PHASE0_STORAGE_MODE=memory`
- `PHASE0_GRAPH_MODE=mock`
- `PHASE0_AUTH_MODE=mock`

That means:

- facts are stored in memory for local/test runs
- Graph calls are mocked
- auth refresh is mocked

The production convergence target is still:

- Postgres for facts
- R2 for blobs
- Durable Objects for mailbox coordination

## Commands

```bash
npm install
npm run typecheck
npm test
npm run dev
```

## Next production-hardening steps

1. replace memory facts repository with a real Postgres/Hyperdrive adapter
2. wire real Graph subscription / message / delta APIs
3. wire real auth refresh flow
4. add queue backlog and latency metrics export
5. add integration/E2E runs against a real mailbox cohort
