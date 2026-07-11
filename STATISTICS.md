# Statistics Specification

## Conventions

Metrics declare eligibility rules, time window, cohort filters, currency normalization, costs/slippage inclusion, definition version, sample size, and uncertainty where applicable. Open trades are excluded from realized-return metrics unless explicitly stated. Let each closed trade have net P&L `p_i`, initial risk `risk_i > 0`, return `r_i`, and `R_i = p_i / risk_i`.

| Metric                  | Definition                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| Win / loss rate         | wins or losses divided by eligible closed trades; breakeven reported separately           |
| Profit factor           | gross profit / absolute gross loss; undefined when gross loss is zero                     |
| Expectancy              | mean net P&L or mean R, with unit shown                                                   |
| Average R               | arithmetic mean of valid `R_i`                                                            |
| Average win / loss      | mean positive P&L / absolute mean negative P&L                                            |
| Maximum drawdown        | largest peak-to-subsequent-trough decline in equity, amount and percent                   |
| Rolling drawdown        | current/window peak-to-current equity decline over a declared window                      |
| Rolling win rate        | win rate over trailing N trades or duration                                               |
| Rolling profit factor   | profit factor over the same declared rolling window                                       |
| Confidence calibration  | observed outcome frequency by prediction bin; include Brier score and ECE                 |
| Sharpe ratio            | annualized mean excess return / standard deviation, frequency and risk-free rate declared |
| Sortino ratio           | annualized mean excess return / downside deviation, target declared                       |
| Calmar ratio            | annualized return / absolute maximum drawdown                                             |
| Recovery factor         | cumulative net profit / absolute maximum drawdown                                         |
| MAE / MFE               | worst / best intratrade excursion relative to entry, in price, percent, and R where valid |
| Trade duration          | min, median, mean, p90, max from entry to exit                                            |
| Consecutive wins/losses | maximum and distribution of uninterrupted outcome streaks; breakeven policy declared      |

## Required cohorts

- Pair/instrument statistics.
- Trading session statistics using versioned session calendars.
- Market regime statistics using the regime version active at decision time.
- Plugin reliability: availability, successful runs, timeout/error rate, p50/p95 latency, freshness, deterministic mismatch rate, and contribution outcome.
- Strategy statistics by strategy/configuration version.

## Statistical safeguards

- Always show sample size and analysis period.
- Prefer bootstrap confidence intervals for non-normal trading distributions.
- Mark ratios undefined instead of inventing values for zero denominators.
- Correct or disclose multiple comparisons when exploring many cohorts.
- Never mix strategy/plugin versions without an explicit aggregate view.
- Results must include fees and slippage status and must distinguish realized from hypothetical outcomes.

Detailed examples live in `docs/statistics.md`.
