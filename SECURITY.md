# Security policy

## Reporting

Do not open public issues for suspected vulnerabilities or include credentials, tokens, market-account information, or private workspace data in a report. Contact the repository owner privately with the affected revision, impact, reproduction steps, and suggested mitigation. Rotate any credential included in a report immediately.

## Supported version

Only the current `main` revision is supported before the first tagged release. Security fixes may require upgrading configuration, migrations, and the deployed artifact together.

## Operational baseline

Production must use TLS, external PostgreSQL and Redis, secret management, non-silent structured logs, least-privilege service identities, encrypted backups, dependency scanning, and the evidence in `docs/release-checklist.md`. TradeAt does not submit real broker orders.
