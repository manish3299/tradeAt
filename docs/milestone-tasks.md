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
- [ ] Add cross-tenant authorization tests once tenant-owned market resources exist.

## Milestone 3 - Market Data and Pipeline

- [x] Define instruments, bars, market status, and market data store contracts.
- [x] Implement lite-mode sample instruments and normalized bar storage.
- [x] Expose bounded history/status APIs and a signed-in frontend preview.
- [x] Define provider and clock ports for historical imports.
- [x] Implement CSV historical import with idempotent lite-mode upsert.
- [x] Add fixture-backed point-in-time `as_of` query coverage.
- [ ] Define sessions, ticks, and live provider ports.
- [ ] Implement one live provider adapter and persistent normalized bar storage.
- [ ] Add ordering, deduplication, corrections, gaps, freshness, reconnect, and idempotency beyond CSV imports.
- [ ] Expand point-in-time correctness across indicators, replay, and persistent storage.

## Milestone 4 - Indicators and Regimes

- [x] Implement deterministic EMA, RSI, and ATR calculations.
- [x] Expose point-in-time indicator API and signed-in preview.
- [x] Add point-in-time trend and volatility regime classification.
- [ ] Implement the plugin contract.
- [ ] Add higher-timeframe trend and price structure classification.
- [ ] Version inputs/configuration/outputs and define warm-up/missing-data behavior.
- [ ] Add golden/property tests and prevent correlated evidence from being double-counted.

## Milestone 5 - Decision Engine v1

- [ ] Implement data, regime, setup, evidence, risk/target, and confidence gates.
- [ ] Produce long/short/abstain with entry zone, stop, targets, R, vetoes, and reasons.
- [ ] Add configurable weights, risk limits, conservative targets, and immutable versions.
- [ ] Prove deterministic decisions and point-in-time correctness.

## Milestone 6 - Replay, Backtest, and Statistics

- [ ] Implement deterministic clock/event source, controls, checkpoints, and version pinning.
- [ ] Run the live decision contracts on chronological historical data without look-ahead.
- [ ] Model spread, fees, slippage, ambiguous intrabar order, and realistic target/stop fills.
- [ ] Add walk-forward evaluation against simple baselines rather than one optimized period.
- [ ] Report expectancy R, profit factor, drawdown, hit rate, calibration, MAE/MFE, and coverage.
- [ ] Require minimum samples and show results by instrument, session, regime, and setup.

## Milestone 7 - Paper Trading and Journal

- [ ] Implement paper accounts, orders, deterministic fills, positions, and balanced ledger.
- [ ] Add fee/slippage/latency/liquidity models, risk limits, and permanent PAPER labeling.
- [ ] Implement journal lifecycle, notes/tags, R, duration, MAE/MFE, and audit history.
- [ ] Track forward paper results separately from replay and manual trades.
- [ ] Prove reconciliation, tenant isolation, idempotency, and complete broker isolation.

## Milestone 8 - MVP Dashboard

- [ ] Build watchlist, chart, freshness/regime, indicator, and explainable decision panels.
- [ ] Add replay controls/results, paper order ticket, positions, equity, and journal workflow.
- [ ] Add core analytics with sample sizes, uncertainty, costs, and result-origin labels.
- [ ] Cover loading/stale/error/reconnect states, responsive behavior, and accessibility.
- [ ] Pass the end-to-end decision -> replay -> paper -> journal -> analytics journey.

## Milestone 9 - Historical Memory

- [ ] Store point-in-time setup, feature, regime, decision, and outcome snapshots.
- [ ] Implement reproducible similarity/cohort retrieval with provenance and uncertainty.
- [ ] Test temporal correctness, version isolation, and retrieval stability.

## Milestone 10 - Strategy Validation and Learning

- [ ] Add configuration/dataset registries and reproducible strategy comparison reports.
- [ ] Add promotion gates for expectancy, calibration, drawdown, stability, and sample size.
- [ ] Monitor drift and performance degradation without automatic self-deployment.

## Milestone 11 - Kronos Machine Learning

- [ ] Integrate Kronos behind a replaceable forecast adapter in shadow mode.
- [ ] Evaluate it with chronological splits, embargo/leakage controls, and simple baselines.
- [ ] Measure calibration, latency, drift, regime stability, and agreement/disagreement outcomes.
- [ ] Promote only as bounded evidence after approved out-of-sample improvement.

## Milestone 12 - Production Polish and Release

- [ ] Complete security, privacy, accessibility, performance, and dependency reviews.
- [ ] Validate migrations, backup/restore, retention, observability, and runbooks.
- [ ] Run full adversarial, replay, paper, browser, and release-candidate checks.
- [ ] Complete deployment documentation, known issues, and release checklist.
