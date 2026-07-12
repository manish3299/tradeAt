# UI/UX Specification

## Principles

- Make market freshness, source health, and uncertainty visible.
- Explain decisions before offering dense detail.
- Preserve context across live, journal, and replay views.
- Meet WCAG 2.2 AA: keyboard operation, visible focus, semantic structure, contrast, reduced motion, and non-color status cues.
- Never imply guaranteed returns or hide sample size.

## Information architecture

- **Dashboard:** watchlist, market state, chart, indicators, decision card, alerts.
- **Journal:** trade list, filters, lifecycle timeline, notes, screenshots, outcome metrics.
- **Paper Trading:** paper account selector, cash/equity, order ticket, open orders, positions, fills, P&L, and reset history.
- **Replay:** dataset selector, clock controls, chart, synchronized decisions, journal actions.
- **Analytics:** KPI definitions, equity/drawdown, cohorts, calibration, plugin reliability.
- **Plugins:** installed catalog, compatibility, permissions, configuration, health, enable/disable.
- **Settings:** profile, timezone, workspace, providers, sessions, notification and risk defaults.

## Decision card

Show direction/abstain, score, calibrated confidence, timestamp, data freshness, regime, and ranked contributions. Expanded state shows component versions, input window, vetoes, missing evidence, and a reproducibility identifier.

An eligible decision may prefill a paper order ticket, but submission requires an
explicit user action by default. Any later automatic-paper mode is separately
enabled, visibly persistent, risk-limited, and auditable.

## Paper-mode safety

Every paper-trading surface displays a persistent non-color-only `PAPER` badge.
Balances and performance state the starting capital, currency, fee/slippage model,
and whether prices are live, delayed, or replayed. Reset requires confirmation and
creates a new account version without erasing prior history. Paper results are
never presented as realized brokerage returns.

## States

Every data surface defines loading, empty, stale, partial, error, unauthorized, and reconnecting states. Stale data remains visible but clearly marked with age; it is never presented as live.

## Responsive behavior

Desktop supports multi-panel analysis. Tablet collapses secondary panels. Mobile prioritizes watchlist, price/freshness, decision explanation, and journal entry; complex configuration uses dedicated routes.

## Performance targets

- Initial usable shell within 2.5 seconds on a typical broadband connection.
- Interaction response within 100 ms where local; long work shows progress and cancellation.
- Charts virtualize or aggregate large datasets and avoid unbounded client retention.
