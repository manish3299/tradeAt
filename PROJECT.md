# Project Definition

## Problem

Trading tools often separate market context, signal reasoning, journaling, replay, and performance measurement. This makes decisions hard to audit and improvements hard to validate. TradeAt joins those workflows around a shared, point-in-time data model.

## v1 outcomes

- A user can monitor configured instruments and see fresh, explained indicator values.
- A user can inspect a decision score and the contribution of each enabled component.
- A user can journal a trade and measure its lifecycle consistently.
- A user can paper trade decisions with simulated fills, fees, slippage, positions, and account equity without connecting a broker.
- A user can replay a historical period without look-ahead leakage.
- A user can compare versions using statistically defined metrics and cohorts.
- A developer can install a compatible plugin without editing core modules.

## Success measures

- 99.5% successful normalized ingestion during supported market sessions.
- 100% of published decisions include provenance and explanation.
- Replays are deterministic in automated tests.
- A new reference indicator plugin can be added in under one working day.
- Users can trace any displayed metric to its definition, filters, and data window.
- Paper orders never leave TradeAt, and simulated results are visually and statistically separated from real/manual records.

## Constraints

- Data licensing and provider limits vary; adapters must isolate provider-specific behavior.
- Market timestamps, sessions, corrections, and corporate actions require explicit handling.
- Statistical samples may be small; the UI must show sample size and uncertainty.
- Initial development targets one deployable environment and horizontal evolution later.

## Delivery strategy

Build vertical, testable milestones. Authentication and trustworthy data precede
deterministic analytics and decisions. Replay/backtesting then produces the first
historical evidence, paper trading produces forward evidence on unseen data, and
the dashboard completes the MVP. Historical memory and ML follow only after this
baseline is measurable. Each milestone has an observable outcome and exit criteria
in `ROADMAP.md`.

## Current implementation status

Milestone 2 authentication has the first working vertical slice: users can create
a workspace, log in, rotate refresh tokens, log out, and load `/api/v1/me` in
lite mode without Docker. External mode now has a PostgreSQL identity schema and
persistent identity store. The remaining authentication slice is stricter
cross-tenant authorization coverage once tenant-owned market resources exist.
