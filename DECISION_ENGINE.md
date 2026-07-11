# Decision Engine

## Purpose

Produce an explainable, reproducible decision from versioned evidence. Outputs are `long`, `short`, or `abstain`; they are not orders.

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
