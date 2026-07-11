# Testing Strategy

Use a test pyramid with domain unit/property tests, adapter integration tests against real dependency containers, API/event contract tests, and a small critical end-to-end suite. Use fixed clocks, seeded randomness, provider fixtures, and isolated databases. Performance tests cover ingest, fan-out, statistics, and replay; resilience tests cover reconnect, duplicate delivery, Redis loss, worker restart, and migration compatibility.
