# Indicator Reference

Indicators consume ordered point-in-time observations and emit versioned outputs. Each definition must state formula, required fields, warm-up, precision/rounding, missing/duplicate/out-of-order behavior, incremental equivalence, and trusted test vectors.

## EMA

For period `n`, `alpha = 2 / (n + 1)` and `EMA_t = alpha*x_t + (1-alpha)*EMA_(t-1)`. The reference seed is the SMA of the first `n` valid observations; output is unavailable before warm-up. Other seeds require a distinct configuration/version.

## RSI (Wilder)

For period `n`, calculate changes, gains, and losses. Seed average gain/loss over the first `n` changes, then use Wilder smoothing. `RS = avg_gain / avg_loss`, `RSI = 100 - 100/(1+RS)`. If both averages are zero, define RSI as 50; if loss is zero and gain positive, define 100.
