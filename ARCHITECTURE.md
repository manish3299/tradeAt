# Architecture

## Shape

TradeAt begins as a modular monolith with background workers. This keeps transactions and local development simple while preserving boundaries that can later be extracted.

```text
Browser
  | HTTPS / WebSocket
API + application services
  |-- Identity module
  |-- Market module
  |-- Analytics/plugin module
  |-- Decision module
  |-- Journal module
  |-- Replay module
  |-- Statistics module
  |-- Learning module (gated)
  |
  |-- PostgreSQL (authoritative state)
  |-- Redis (cache, stream coordination, rate limits)
  `-- Workers (ingestion, calculation, replay, statistics)
```

## Layer contracts

- **Domain:** entities, value objects, policies, and repository ports.
- **Application:** use cases, transaction boundaries, authorization, orchestration.
- **Adapters:** HTTP/WebSocket, database repositories, providers, cache, queues.
- **Presentation:** frontend routes, state, accessibility, and visualization.

Modules communicate through application interfaces or versioned domain events, never by reading another module's tables directly.

## Event envelope

Every real-time/domain event includes `event_id`, `event_type`, `schema_version`, `occurred_at`, `recorded_at`, `correlation_id`, `producer`, and `payload`. Consumers must tolerate additive fields and reject unsupported major schema versions.

## Reliability

- Transactional outbox publishes events after authoritative writes.
- Consumers use event IDs for idempotency.
- Provider reconnect uses bounded exponential backoff and jitter.
- Health endpoints distinguish liveness, readiness, and dependency degradation.
- OpenTelemetry traces correlate ingest, calculation, publication, and UI delivery.

## Security

- Passwords use a memory-hard password hash; sessions use short-lived access tokens and rotated refresh tokens.
- Secrets come from environment/secret storage and are never committed or logged.
- Authorization is deny-by-default and user/workspace scoped.
- Sensitive mutations and plugin lifecycle operations create audit events.
- Inputs are schema validated; rate limits apply to authentication and expensive queries.

## Architecture decisions

### ADR-001: Modular monolith first

**Status:** accepted. **Reason:** v1 needs cohesive transactions and rapid iteration; enforced module boundaries preserve an extraction path.

### ADR-002: PostgreSQL authoritative, Redis ephemeral

**Status:** accepted. **Reason:** relational integrity and time-oriented queries are central. Cache loss must not lose business state.

### ADR-003: Shared live/replay contracts

**Status:** accepted. **Reason:** algorithm divergence invalidates research. Clock and event source are injected ports.

### ADR-004: No automated execution in v1

**Status:** accepted. **Reason:** execution materially increases operational, regulatory, and financial risk before decision quality is validated.

### ADR-005: TypeScript workspace and framework stack

**Status:** accepted. **Decision:** Node.js 22 and TypeScript use npm workspaces. Fastify provides the backend HTTP boundary, React with Vite provides the frontend, Drizzle manages PostgreSQL schema/migrations, and Redis is accessed through a narrow adapter. Vitest, ESLint, and Prettier provide shared quality gates. **Reason:** one strict type system reduces early operational overhead while Fastify keeps transport concerns lightweight and explicit. Framework dependencies remain outside the domain layer.

### ADR-006: Lite local dependencies by default

**Status:** accepted. **Decision:** Local development defaults to `DEPENDENCY_MODE=lite`, which uses in-process readiness probes and skips database migrations. `DEPENDENCY_MODE=external` enables PostgreSQL/Redis probes and migration execution for staging, production, or stronger development machines. **Reason:** the project must remain usable on low-resource laptops without losing the production architecture.
