# Release checklist

## Evidence required before release

- [ ] `npm ci`, `npm run check`, `npm run db:migrate`, and `npm audit --audit-level=high` pass from a clean checkout.
- [ ] External-mode PostgreSQL and Redis readiness is green; migration compatibility is tested on a restored production-like backup.
- [ ] Backup restore completes into an isolated database and record counts plus a bounded replay match the source.
- [ ] Authentication abuse, workspace isolation, oversized request, malformed CSV, stale data, replay look-ahead, and paper/live-origin tests pass.
- [ ] Keyboard navigation, focus visibility, labels, contrast, responsive layouts, and screen-reader landmarks are manually checked.
- [ ] API p95 latency, replay duration, memory ceiling, error rate, dependency health, worker lag, and data freshness meet the recorded release budget.
- [ ] Retention periods for sessions, audit records, market data, replay artifacts, and journals are approved and configured.
- [ ] Secrets are stored outside Git, logs redact credentials, TLS is enforced, and rollback/on-call owners are named.
- [ ] Known issues, release notes, artifact revision, migration revision, configuration versions, and rollback artifact are recorded.

No checklist item may be inferred from a successful unit test. External and manual checks require dated evidence and an owner.
