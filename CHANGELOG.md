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
- Strict TypeScript, ESLint, Prettier, Vitest, production build, and dependency-audit gates.

### Fixed

- None.

### Improved

- Local development no longer requires Docker, PostgreSQL, or Redis.

### Known issues

- Full PostgreSQL and Redis validation should run later with `DEPENDENCY_MODE=external` against managed services, staging, or a stronger machine.
- Drizzle Kit reports an offline peer-resolution error for `drizzle-kit check` despite the latest compatible `drizzle-orm`; CI uses the authoritative migration execution check instead.
- Drizzle Kit retains a development-only moderate esbuild advisory; there are no high or critical npm audit findings.
