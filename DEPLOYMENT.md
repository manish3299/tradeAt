# Deployment

## Environments

Local development uses the Node.js workspace directly in `DEPENDENCY_MODE=lite` so low-resource laptops do not need local containers. Staging and production use versioned artifacts with environment-specific validated configuration. Production secrets live in a managed secret store.

## Components

- Web frontend served behind TLS.
- API and worker processes from the same versioned backend image.
- Managed PostgreSQL with encrypted backups and point-in-time recovery.
- Redis for disposable cache/coordination with persistence only if a chosen workflow requires it.
- OpenTelemetry-compatible logs, metrics, traces, and alerting.

## Release process

1. Pass formatting, lint, types, tests, build, migration, security, and smoke gates.
2. Build immutable, scanned artifacts with source revision metadata.
3. Back up and test migration in staging.
4. Deploy with health/readiness gates and backwards-compatible schema.
5. Run smoke tests, watch SLOs, then complete rollout.
6. Roll back application on regression; use forward recovery for applied database changes.

## Operational targets

Define alerts for ingestion freshness, WebSocket disconnects, queue lag, API error/latency, database saturation, plugin failures, replay failures, and backup age. Run restore and incident-response exercises before v1 release.
