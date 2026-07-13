# Roadmap

Status values: `not started`, `in progress`, `complete`, `blocked`. A milestone is complete only when its exit criteria and quality gates pass.

Detailed implementation checklists are maintained in `docs/milestone-tasks.md`.

| #   | Milestone                        | Status      | User-visible result                                                                                                                 |
| --- | -------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Project setup                    | complete    | TradeAt builds, tests, and runs locally on the low-end laptop.                                                                      |
| 2   | Authentication                   | complete    | A user can securely register, sign in, and own an isolated workspace.                                                               |
| 3   | Market data and pipeline         | complete    | TradeAt can ingest, normalize, store, and query trustworthy historical/live bars.                                                   |
| 4   | Indicators and regimes           | complete    | Charts/data expose deterministic EMA, RSI, ATR, structure, and market-regime evidence.                                              |
| 5   | Decision engine v1               | complete    | TradeAt produces explainable long/short/abstain decisions with entry, stop, targets, risk, and vetoes.                              |
| 6   | Replay, backtest, and statistics | complete    | **First actual results:** walk-forward historical outcomes, expectancy, target-hit rate, drawdown, calibration, MAE/MFE, and costs. |
| 7   | Paper trading and journal        | complete    | **Forward results:** decisions become simulated orders/fills/positions with paper equity and an auditable journal.                  |
| 8   | MVP dashboard                    | complete    | **MVP ready:** one usable interface for market state, decisions, replay results, paper trading, journal, and core analytics.        |
| 9   | Historical memory                | complete    | Decisions show how comparable point-in-time setups performed previously.                                                            |
| 10  | Strategy validation and learning | not started | Strategy/config versions are compared, monitored, and promoted through reproducible evidence gates.                                 |
| 11  | Kronos machine learning          | not started | Kronos runs in shadow mode and becomes bounded evidence only if it improves the deterministic baseline out of sample.               |
| 12  | Production polish and release    | not started | Security, accessibility, performance, restore, deployment, documentation, and release gates pass.                                   |

## Current next action

Start Milestone 10 reproducible strategy validation, comparison reports, promotion gates, and drift monitoring.

## Delivery checkpoints

- **Milestone 5 — Decision alpha:** inspect explainable decisions, but do not judge profitability yet.
- **Milestone 6 — Research proof:** obtain the first statistically honest historical results with fees, slippage, and no-look-ahead controls.
- **Milestone 7 — Forward proof:** collect paper-trading results on unseen incoming data.
- **Milestone 8 — MVP:** use the complete decision-to-result workflow from one dashboard.

The MVP is not considered successful from win rate alone. It must report sample
size, expectancy in R, profit factor, maximum drawdown, target-one hit rate,
calibration, abstention/coverage, fees, and modeled slippage by regime and setup.
