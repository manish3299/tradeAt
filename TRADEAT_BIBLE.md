# TradeAt Bible

## Purpose

TradeAt helps a trader answer: what is happening, why does it matter, what evidence supports a decision, and how have similar decisions performed? It is a decision-support and research system, not a promise of profit.

## Product principles

1. **Evidence before opinion.** Signals include their inputs, timestamp, version, confidence, and explanation.
2. **Determinism before intelligence.** Replay and rule-based results must be reproducible before ML is introduced.
3. **Point-in-time correctness.** Calculations may only use information available at the evaluated timestamp.
4. **Plugin-first extensibility.** Indicators, strategies, data sources, and scoring components extend stable interfaces without modifying core orchestration.
5. **Safe degradation.** Stale, missing, duplicated, or out-of-order data is visible and never silently treated as current.
6. **Configuration over forks.** Markets, sessions, thresholds, retention, and features are configurable and validated.
7. **Measure the system.** Latency, reliability, calibration, drawdown, and strategy outcomes are first-class metrics.
8. **Human control.** The user can inspect, override, disable, and audit decision components.

## Primary users

- A discretionary trader monitoring markets and recording decisions.
- A researcher replaying historical sessions and comparing strategies.
- A plugin developer adding an indicator, strategy, or data adapter.

## Core capabilities

- Authentication and user-scoped workspaces.
- Normalized live and historical market data.
- Indicator and strategy plugin runtime.
- Explainable decision engine with calibrated confidence.
- Live dashboard with freshness and health states.
- Trade journal with immutable event history.
- Paper trading with deterministic simulated orders, fills, positions, and account equity.
- Deterministic replay using the same calculation contracts as live mode.
- Point-in-time historical memory and similarity search.
- Optional, gated ML models evaluated against deterministic baselines.
- Versioned statistics across pair, session, regime, plugin, and strategy dimensions.

## Canonical domain language

- **Instrument:** tradeable symbol plus venue and asset class.
- **Bar:** OHLCV observation for one instrument and timeframe.
- **Tick:** timestamped quote or trade observation.
- **Signal:** plugin output expressing evidence, direction, strength, and metadata.
- **Decision:** versioned aggregation of signals at a point in time.
- **Trade:** journal entity representing a planned or actual position lifecycle.
- **Paper account:** simulated cash, equity, orders, fills, and positions that never reach a broker.
- **R:** profit or loss divided by initial risk; undefined when initial risk is invalid.
- **Replay:** deterministic delivery of historical events through live-compatible contracts.
- **Regime:** versioned classification of market conditions.

## System invariants

- Store timestamps in UTC; render in the user's selected timezone.
- Monetary and price values use fixed-precision decimal types, never binary floats at persistence boundaries.
- Raw market events are append-only; corrections create traceable replacement events.
- Every derived value records algorithm/plugin version and input range.
- All user-owned records enforce tenant ownership at service and database boundaries.
- Replay never reads future observations.
- A decision is immutable after publication; recomputation creates a new version.
- Paper activity is always labeled and stored separately from manually recorded or real activity.
- Idempotency keys protect ingestion and mutation APIs where retries are expected.

## Quality targets for v1

- API p95 latency under 250 ms for ordinary cached reads.
- Dashboard market update propagation p95 under 1 second after normalized ingestion.
- Replay gives identical outputs for identical dataset, configuration, seed, and versions.
- At least 80% backend domain/service coverage and critical-path end-to-end tests.
- No known critical or high-severity security vulnerabilities at release.

## Architectural guardrails

- Clean Architecture dependencies point inward: adapters → application → domain.
- Domain code has no framework, database, broker, or transport dependency.
- PostgreSQL is the system of record; Redis is ephemeral acceleration and coordination.
- The API is versioned under `/api/v1`; real-time events have versioned envelopes.
- Background work is retryable, idempotent, observable, and dead-lettered when exhausted.
- ML cannot become the sole decision path until it beats an approved baseline out of sample and passes calibration and drift gates.

## v1 non-goals

- Autonomous or high-frequency order execution.
- Submission of real-money orders; v1 execution is simulation-only.
- Custody of funds or broker credentials beyond read-only integrations.
- Social trading, copy trading, or public strategy marketplace.
- Claims of guaranteed profitability.

## Change policy

Update this file only for product principles, invariants, major scope changes, or architectural guardrails. Record the rationale in `ARCHITECTURE.md` and the user-visible change in `CHANGELOG.md`.
