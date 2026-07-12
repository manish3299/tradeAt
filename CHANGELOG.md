# Changelog

All notable changes are recorded here. The project follows semantic versioning once code releases begin.

## [Unreleased]

### Added

- Engineering design repository and project source of truth.
- Product, architecture, database, API, UI/UX, plugin, decision, learning, statistics, deployment, standards, and roadmap specifications.
- Milestone session prompts and Codex operating rules.
- TypeScript npm workspace using Node.js 22.
- Fastify API foundation with validated configuration, structured/redacted logging, correlation IDs, graceful shutdown, liveness, and dependency-aware readiness.
- PostgreSQL migration baseline and Redis/PostgreSQL dependency probes.
- React/Vite frontend foundation with accessible ready, degraded, and unreachable platform states.
- Laptop-friendly lite dependency mode and a GitHub Actions quality/migration/security workflow.
- Optional Docker Compose development dependencies for external PostgreSQL/Redis validation on capable machines.
- Versioned decision policy defining data/regime/setup gates, independent evidence groups, bounded Kronos evidence, calibrated confidence, and risk-aware target validation.
- Paper-trading specification covering simulated accounts, orders, fills, positions, ledger reconciliation, deterministic execution assumptions, risk controls, APIs, UI safety labeling, and separated statistics.
- Milestone-by-milestone implementation checklists and authentication milestone tracking.
- Result-first milestone ordering with historical validation at Milestone 6, forward paper validation at Milestone 7, and the complete MVP at Milestone 8.
- Authentication domain, in-memory identity store, scrypt password hashing, opaque token generation, register/login/refresh/logout/`/me` APIs, and auth workspace UI.
- In-memory auth rate limiting and tests for refresh-token reuse and repeated auth attempts.
- PostgreSQL identity schema and persistent identity store for external dependency mode.
- Auth service expiry tests for access and refresh tokens.
- Backend Vitest configuration tuned for low-end local machines while preserving real password hashing behavior.
- Market data domain contracts, lite-mode instruments/bars store, `/api/v1/instruments`, `/api/v1/market/bars`, and `/api/v1/market/status`.
- CSV historical bar provider and `/api/v1/market/bars/import` for idempotent lite-mode candle imports.
- Point-in-time `as_of` market bar queries plus a fixture-backed no-lookahead test.
- Point-in-time EMA, RSI, and ATR indicator service, `/api/v1/indicators`, tests, and frontend indicator preview.
- Point-in-time trend/volatility regime classifier, `/api/v1/regimes`, tests, and frontend regime preview.
- Signed-in frontend market data preview with instrument selection, freshness status, and recent 5-minute bars.
- Strict TypeScript, ESLint, Prettier, Vitest, production build, and dependency-audit gates.
- Venue-timezone market sessions, normalized tick/live-event contracts, and a cancellable live provider port.
- Postgres-backed market data store for external mode and a deterministic replay live provider adapter.
- Live market ingestion service with event ordering, idempotent deduplication, correction validation, gap tracking, freshness state, and reconnect retry handling.
- Point-in-time market queries now require bars to be both closed and received by `as_of`, collapse duplicate revisions to the latest known revision, and cover indicator/regime no-lookahead behavior.
- Plugin manifest, registry, configuration validation, deterministic execution context, run receipts, and provenance contract.
- Higher-timeframe trend and recent price-structure classification for regime analysis.
- Versioned indicator/regime outputs with configuration hashes, input ranges, quality states, and explicit warm-up/missing-data metadata.
- Golden indicator vectors, property-style indicator invariants, and evidence-group collapse to prevent correlated signal double-counting.

### Fixed

- None.

### Improved

- Local development no longer requires Docker, PostgreSQL, or Redis.
- Decision quality is explicitly measured by expectancy, calibration, drawdown, target-one outcomes, and abstention reasons instead of signal count alone.
- Frontend visuals now use a minimal light day-mode palette with white surfaces, soft gray borders, restrained typography, and a single green accent.

### Known issues

- Full PostgreSQL and Redis validation should run later with `DEPENDENCY_MODE=external` against managed services, staging, or a stronger machine.
- Drizzle Kit reports an offline peer-resolution error for `drizzle-kit check` despite the latest compatible `drizzle-orm`; CI uses the authoritative migration execution check instead.
- Drizzle Kit retains a development-only moderate esbuild advisory; there are no high or critical npm audit findings.
