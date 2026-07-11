# Coding Standards

## General

- Prefer simple, explicit code and small modules with one reason to change.
- Domain logic depends on ports, not frameworks or infrastructure.
- Validate configuration and external input at boundaries; preserve typed values internally.
- Do not add placeholders, silent fallbacks, disabled tests, or untracked TODOs.
- Public behavior, decisions, and non-obvious trade-offs are documented.

## Correctness

- UTC internally; injected clocks in tests and replay.
- Decimal price/money arithmetic with explicit rounding policy.
- Deterministic algorithms declare warm-up, missing-data, and tie behavior.
- Async work supports cancellation, timeouts, retries only for transient failures, and idempotency.
- Errors use stable codes and retain causes without leaking secrets.

## Testing

- Unit tests cover domain policies and edge cases.
- Integration tests cover repositories, providers, cache, and API contracts.
- End-to-end tests cover authentication, live dashboard, journal, and replay journeys.
- Property/golden tests protect indicators and statistics against trusted fixtures.
- Bug fixes include a regression test. Tests must be deterministic and isolated.

## Security and privacy

- Never log credentials, tokens, full request bodies, or unnecessary personal data.
- Pin dependencies and review lockfile changes.
- Use parameterized database access and context-aware output escaping.
- Enforce authorization in application services, not only the UI.

## Quality gates

Before a milestone is complete: format, lint, type-check, build, test, migration-check, dependency/security scan, start the app, smoke-test the changed path, and update `CHANGELOG.md` and `ROADMAP.md`. Commit only when explicitly requested by the user; automation must not assume authorization to commit.

## Git

- `main` is releasable; `develop` integrates current work; `feature/<name>` isolates features.
- Never work directly on `main`.
- Commits are focused and explain intent. Do not combine formatting sweeps with behavior changes.
- Review database, public contract, security, and latency implications explicitly.
