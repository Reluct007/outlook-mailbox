# TODO

## Next execution: OTP panel projection + read API

Status: pending
Priority: next

### Goal

Build the first OTP-panel read path on top of the existing Phase 0 storage, while keeping:

- Durable Object as the only mailbox lifecycle coordinator
- Postgres for facts and projections
- R2 for blobs
- no compatibility layer

### Scope

1. Add current signal projection
   - `mailbox_current_signals`
   - unique key on `mailbox_id + signal_type`
   - overwrite rules for latest signal only

2. Extend parse-path persistence
   - facts
   - `message_rule_matches`
   - `hit_events`
   - current signal projection
   - all writes in one transaction

3. Add OTP panel read model
   - cross-mailbox latest OTP selection
   - waiting vs unhealthy state derivation
   - recent OTP history
   - secondary non-OTP signals

4. Add API and validation
   - `GET /api/otp-panel`
   - unit/integration tests for projection semantics
   - `npm run typecheck`
   - `npm test`

### Suggested files

- `schema/0001_phase0.sql`
- `src/lib/types.ts`
- `src/lib/facts-repository.ts`
- `src/lib/postgres/sql.ts`
- `src/lib/postgres/repository.ts`
- `src/lib/otp-panel.ts`
- `src/index.ts`
- `test/*`

### Acceptance

- OTP homepage data can be read from a dedicated API
- latest OTP comes from projection, not ad-hoc fact scans
- late or duplicate events do not regress current signal
- waiting and unhealthy states are distinguishable
- tests cover projection overwrite and rollback semantics
