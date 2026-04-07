# Contributing

Thanks for considering a contribution.

This project is small on purpose and favors directness over abstraction. Please keep that bar when proposing changes.

## Before You Start

- read [`README.md`](./README.md) for the project boundary
- read [`docs/PRODUCT.md`](./docs/PRODUCT.md) if you are changing product behavior
- read [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) if you are changing routes, storage, auth, or lifecycle flow

## Ground Rules

- keep changes focused and reviewable
- prefer simple, readable implementations over compatibility shims
- do not add speculative features
- do not commit secrets, private URLs, mailbox identifiers, or captured production payloads
- when configuration or behavior changes, update the docs in the same pull request

## Development

Install dependencies:

```bash
npm install
```

Minimal local mock mode:

```bash
cp .dev.vars.example .dev.vars
```

Then set:

```bash
PHASE0_STORAGE_MODE=memory
PHASE0_GRAPH_MODE=mock
PHASE0_AUTH_MODE=mock
PHASE0_OPERATOR_PASSWORD=dev-password
```

Start the worker:

```bash
npm run dev
```

## Validation

Run the full local checks before opening a pull request:

```bash
npm run typecheck
npm test
```

If your change affects schema behavior:

- add a forward-only SQL migration in `schema/`
- update tests that cover repository or schema semantics
- keep runtime code out of auto-migration behavior

If your change affects auth, webhook handling, or mailbox credential storage:

- document the new boundary or invariant
- include tests for the failure path, not only the happy path

## Pull Requests

A good pull request for this repository usually contains:

- one clear behavior change
- updated tests
- updated docs when applicable
- a concise explanation of the operational impact

If you are making a large or breaking change, open an issue first so the scope can be aligned before implementation.
