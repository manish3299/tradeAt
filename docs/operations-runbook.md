# Operations runbook

## Deploy

Build one reviewed Git revision with Node.js 22. Run migrations as a separate one-shot job before switching traffic. Start the API with `NODE_ENV=production` and `DEPENDENCY_MODE=external`, using secret-managed PostgreSQL and Redis URLs. Verify `/health/live`, `/health/ready`, login, workspace isolation, a bounded market query, one replay, and paper account creation.

## Backup and restore

Use the managed PostgreSQL snapshot service or `pg_dump` in custom format. Encrypt backups, restrict access, record retention and restore objectives, and never test restoration over the source database. Restore to an isolated instance, run migrations, compare table counts and critical hashes, execute a bounded replay, then destroy the isolated credentials after evidence is retained.

## Incident and rollback

If readiness, error rate, latency, freshness, or worker lag breaches its release threshold, stop rollout and route traffic to the previous artifact. Database rollback means restoring a verified backup or applying a reviewed forward repair; never automatically reverse a destructive migration. Rotate exposed credentials, preserve audit logs, record the timeline, and require a post-incident review before redeployment.

## Data retention

Configure retention by data class and jurisdiction. Session/refresh material should be short-lived; audit and financial-research records require an approved longer period. Deletion jobs must be bounded, observable, workspace-safe, and tested against backups. Legal or incident holds override routine deletion.
