# Known issues before first release

- External PostgreSQL migration and isolated backup-restore evidence is not available from the lite development laptop.
- Redis-loss, worker-restart, and sustained-load tests require the production-like environment.
- Accessibility has automated semantic coverage and keyboard/focus/reduced-motion support, but still requires manual screen-reader and contrast verification.
- There is no real broker execution adapter; all orders and fills are explicitly PAPER simulations.
- Strategy comparison records use the in-memory adapter until a production persistence migration is reviewed.
- Retention durations, hosting region, alert thresholds, and on-call ownership remain deployment-specific approvals.
- `npm audit` reports four moderate `esbuild` findings through the `drizzle-kit` development-only migration toolchain. The suggested forced fix is a breaking downgrade; CI blocks high-severity findings, development servers must remain private, and the dependency should be upgraded when a compatible upstream resolution is available.
