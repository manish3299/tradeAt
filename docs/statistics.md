# Statistics Notes

`STATISTICS.md` is normative. Implement each metric as a versioned definition with eligibility, units, window, costs, grouping, sample size, and undefined-state behavior. Golden fixtures should include no trades, all wins, all losses, breakevens, zero risk, zero variance, multiple equity peaks, open trades, fees, and timezone/session boundaries.

Rolling metrics must distinguish trailing trade count from trailing duration. Calibration reports must show bins, count, predicted mean, observed frequency, confidence interval, Brier score, and expected calibration error.

## Implemented replay report

Statistics definition `1.0.0` reports replay origin, execution version, starting equity, analysis period, sample eligibility, decision coverage, expectancy R, profit factor, win/loss/breakeven rates, target-hit rate, maximum drawdown amount and percent, total costs, average MAE/MFE, Brier score, expected calibration error, and 10% calibration bins with Wilson 95% intervals.

Metrics below the configured minimum sample size remain explicitly ineligible and unstable ratios are omitted. Trades with non-positive initial risk or non-finite returns are excluded. Reports segment results separately by instrument, session, regime, and setup; they never mix replay with paper or manual origins.
