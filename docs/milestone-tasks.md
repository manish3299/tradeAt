# Milestone Implementation Tasks

The order is optimized for the earliest trustworthy result. Complete milestones
in order; a checkbox requires implementation, tests, documentation, and quality
gates. Existing session prompts remain module references even where two modules
are now delivered together.

## Milestone 2 - Authentication

- [x] Complete user/workspace/session/audit contracts and lite persistence.
- [x] Implement register, login, refresh rotation/reuse detection, logout, and `/me`.
- [x] Add a lightweight auth workspace UI wired to the API.
- [x] Add password security, deny-by-default `/me`, rate limits, and audit events.
- [x] Add PostgreSQL persistent storage schema/store for external dependency mode.
- [x] Add adversarial refresh reuse, repeated attempt, and expiry tests.
- [x] Add cross-tenant authorization tests once tenant-owned replay resources exist.

## Milestone 3 - Market Data and Pipeline

- [x] Define instruments, bars, market status, and market data store contracts.
- [x] Implement lite-mode sample instruments and normalized bar storage.
- [x] Expose bounded history/status APIs and a signed-in frontend preview.
- [x] Define provider and clock ports for historical imports.
- [x] Implement CSV historical import with idempotent lite-mode upsert.
- [x] Add fixture-backed point-in-time `as_of` query coverage.
- [x] Define sessions, ticks, and live provider ports.
- [x] Implement one live provider adapter and persistent normalized bar storage.
- [x] Add ordering, deduplication, corrections, gaps, freshness, reconnect, and idempotency beyond CSV imports.
- [x] Expand point-in-time correctness across indicators, replay, and persistent storage.

## Milestone 4 - Indicators and Regimes

- [x] Implement deterministic EMA, RSI, and ATR calculations.
- [x] Expose point-in-time indicator API and signed-in preview.
- [x] Add point-in-time trend and volatility regime classification.
- [x] Implement the plugin contract.
- [x] Add higher-timeframe trend and price structure classification.
- [x] Version inputs/configuration/outputs and define warm-up/missing-data behavior.
- [x] Add golden/property tests and prevent correlated evidence from being double-counted.

## Milestone 5 - Decision Engine v1

- [x] Implement data, regime, setup, evidence, risk/target, and confidence gates.
- [x] Produce long/short/abstain with entry zone, stop, targets, R, vetoes, and reasons.
- [x] Add configurable weights, risk limits, conservative targets, and immutable versions.
- [x] Prove deterministic decisions and point-in-time correctness.

## Milestone 6 - Replay, Backtest, and Statistics

- [x] Implement deterministic clock/event source, controls, checkpoints, and version pinning.
- [x] Run the live decision contracts on chronological historical data without look-ahead.
- [x] Model spread, fees, slippage, ambiguous intrabar order, and realistic target/stop fills.
- [x] Add walk-forward evaluation against simple baselines rather than one optimized period.
- [x] Report expectancy R, profit factor, drawdown, hit rate, calibration, MAE/MFE, and coverage.
- [x] Require minimum samples and show results by instrument, session, regime, and setup.

## Milestone 7 - Paper Trading and Journal

- [x] Implement paper accounts, orders, deterministic fills, positions, and balanced ledger.
- [x] Add fee/slippage/latency/liquidity models, risk limits, and permanent PAPER labeling.
- [x] Implement journal lifecycle, notes/tags, R, duration, MAE/MFE, and audit history.
- [x] Track forward paper results separately from replay and manual trades.
- [x] Prove reconciliation, tenant isolation, idempotency, and complete broker isolation.

## Milestone 8 - MVP Dashboard

- [x] Build watchlist, chart, freshness/regime, indicator, and explainable decision panels.
- [x] Add replay controls/results, paper order ticket, positions, equity, and journal workflow.
- [x] Add core analytics with sample sizes, uncertainty, costs, and result-origin labels.
- [x] Cover loading/stale/error/reconnect states, responsive behavior, and accessibility.
- [x] Pass the end-to-end decision -> replay -> paper -> journal -> analytics journey.

## Milestone 9 - Historical Memory

- [x] Store point-in-time setup, feature, regime, decision, and outcome snapshots.
- [x] Implement reproducible similarity/cohort retrieval with provenance and uncertainty.
- [x] Test temporal correctness, version isolation, and retrieval stability.

## Milestone 10 - Strategy Validation and Learning

- [x] Add configuration/dataset registries and reproducible strategy comparison reports.
- [x] Add promotion gates for expectancy, calibration, drawdown, stability, and sample size.
- [x] Monitor drift and performance degradation without automatic self-deployment.

## Milestone 11 - Production Polish and Release

- [ ] Complete security, privacy, accessibility, performance, and dependency reviews.
- [ ] Validate migrations, backup/restore, retention, observability, and runbooks.
- [ ] Run full adversarial, replay, paper, browser, and release-candidate checks.
- [ ] Complete deployment documentation, known issues, and release checklist.
