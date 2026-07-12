# Decision Engine

## Purpose

Produce an explainable, reproducible decision from versioned evidence. Outputs are `long`, `short`, or `abstain`; they are not orders.

The engine is optimized for risk-adjusted expectancy and decision quality, not for
maximizing the number of signals or promising that a target will be reached.

## Decision policy v1

Every evaluation follows the same sequence. A later stage cannot override a hard
veto from an earlier stage.

1. **Data gate** — require fresh, complete, ordered bars/ticks, a valid session,
   sufficient indicator warm-up, and acceptable spread/liquidity. Any failure
   produces `abstain` with a machine-readable veto.
2. **Regime gate** — classify the market as `trend`, `range`, `high_volatility`,
   or `unknown`. `unknown` is abstain; strategy weights are selected by the
   remaining regime.
3. **Setup gate** — identify a configured structure (breakout, pullback,
   reversal, or range rejection) and confirm its higher-timeframe direction.
   A collection of indicators without a valid setup is not a trade.
4. **Evidence score** — calculate independent evidence groups, each normalized
   to `[-1, 1]`: structure (30%), trend (20%), momentum (15%), volatility/risk
   (15%), volume/liquidity (10%), and higher-timeframe agreement (10%). These are
   defaults only; each weight is versioned and configurable by instrument/regime.
5. **Kronos evidence** — add the Kronos forecast as a bounded component (maximum
   10% of the total score). Kronos may confirm or weaken a setup, but cannot
   bypass data, setup, or risk vetoes. Until it passes out-of-sample and
   calibration gates, it runs in shadow mode and does not affect live decisions.
6. **Risk/target gate** — derive the stop from invalidation structure plus an ATR
   volatility buffer. Derive targets from nearby liquidity/structure and expected
   excursion. Reject the setup when the first realistic target does not meet the
   configured reward-to-risk minimum, or when position sizing exceeds risk limits.
7. **Decision mapping** — publish `long` or `short` only when the score clears the
   direction threshold and calibrated confidence clears the minimum. Otherwise
   publish `abstain`.

The score is calculated as:

```text
score = weighted_evidence + kronos_evidence - penalties
```

Penalties include conflicting timeframes, weak liquidity, abnormal volatility,
and disagreement between independent evidence groups. Correlated indicators are
collapsed into one group so EMA and MACD, for example, are not counted as two
independent confirmations.

## Confidence and abstention

Confidence is an empirical, calibrated estimate for the applicable instrument,
timeframe, session, and regime—not subjective certainty. The engine must abstain
when the cohort has too few historical examples, calibration error is too high,
inputs are degraded, or the long/short evidence is nearly balanced. Every
abstention includes the specific reason so the user can distinguish “no setup”
from “system unsafe.”

## Target and trade-management contract

Each actionable decision includes an entry zone, invalidation/stop, first target,
optional second target, initial risk in R, and the conditions that invalidate the
setup before entry. Targets are not fixed percentages: they are constrained by
structure, ATR, liquidity, and historical MFE/MAE for the setup cohort. After
entry, management rules are explicit and versioned (partial at target one,
break-even policy, trailing policy, and time-based exit). The engine never moves
a stop farther away to protect a losing thesis.

## Kronos promotion gates

Kronos can move from shadow mode to bounded live evidence only after walk-forward
evaluation shows improvement over the deterministic baseline in expectancy and
calibration without unacceptable drawdown, regime instability, or latency. A
model/configuration change creates a new version and is evaluated before rollout;
there is no silent self-modification.

## Pipeline

1. Validate freshness, completeness, session, and warm-up.
2. Assemble only point-in-time features.
3. Run enabled signal plugins.
4. Apply hard vetoes (stale data, invalid spread, risk/session rule, insufficient evidence).
5. Normalize component strengths to `[-1, 1]`.
6. Combine using versioned weights and interaction policy.
7. Map score to direction/abstain thresholds.
8. Calibrate empirical confidence for the applicable cohort.
9. Publish an immutable decision with all contributions and provenance.

## Required output

Decision ID/version, instrument/timeframe, evaluated time, direction, raw score, calibrated confidence, regime, freshness, component contributions, vetoes, missing inputs, configuration hash, plugin versions, and input range.

## Rules

- Confidence is an estimated historical frequency for comparable predictions, not subjective certainty.
- Low sample size widens uncertainty or forces abstention.
- Correlated components must not be treated as independent evidence.
- Missing components follow an explicit policy: abstain, degrade, or reweight with disclosure.
- Threshold/weight changes create new configuration versions and are evaluated out of sample.

## Evaluation

Compare against simple baselines using walk-forward splits. Report coverage, precision by direction, expectancy, drawdown, calibration error, latency, and stability by pair/session/regime. Optimize no single metric in isolation.

The minimum scorecard also reports target-one hit rate, average R, profit factor,
maximum and rolling drawdown, MAE/MFE, abstention rate, and the outcomes of
Kronos agreement versus disagreement. Results must be reproducible in replay and
must use point-in-time data only.
