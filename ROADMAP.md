# Roadmap

Status values: `not started`, `in progress`, `complete`, `blocked`. A milestone is complete only when its exit criteria and quality gates pass.

| #   | Milestone                 | Status      | Exit criteria                                                                                                                                                       |
| --- | ------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Project setup             | complete    | Backend/frontend skeletons, local dependencies, CI, observability baseline, health checks, test harness, documented startup                                         |
| 2   | Authentication            | not started | Register/login/refresh/logout, workspace authorization, audit coverage, security tests                                                                              |
| 3   | Market engine             | not started | Instrument model, provider port/reference adapter, normalized events/bars, reconnect and freshness handling                                                         |
| 4   | Data pipeline             | not started | Durable ingestion, idempotency, outbox, data-quality incidents, historical query API                                                                                |
| 5   | Indicators                | not started | Plugin API and EMA/RSI reference plugins with golden tests and versioned outputs                                                                                    |
| 6   | Decision engine           | not started | Explainable score/abstain/veto pipeline, configuration versions, replay parity tests                                                                                |
| 7   | Dashboard                 | not started | Accessible real-time watchlist/chart/decision UI with all degraded states                                                                                           |
| 8   | Journal and paper trading | not started | Trade lifecycle and audit trail plus broker-isolated paper accounts, orders, fills, positions, ledger reconciliation, risk limits, and clearly separated statistics |
| 9   | Replay                    | not started | Deterministic clock/event source, controls/checkpoints, synchronized UI, no-look-ahead tests                                                                        |
| 10  | Historical memory         | not started | Point-in-time snapshots, regime/cohort retrieval, reproducible similarity query                                                                                     |
| 11  | Machine learning          | not started | Dataset registry, baseline/candidate evaluation, calibration/drift, shadow-only promotion gate                                                                      |
| 12  | Polish and release        | not started | Full statistics, performance/accessibility/security review, restore test, docs and release checklist                                                                |

## Current next action

Start milestone 2 authentication: define auth domain contracts, implement register/login/refresh/logout API slices, add password hashing and token rotation, and cover the flows with security-focused tests.
