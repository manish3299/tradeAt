# Continuous Learning Engine

## Policy

Learning is gated, versioned, reproducible, and subordinate to deterministic baselines. No production model trains itself and deploys automatically.

## Flow

1. Snapshot eligible point-in-time features and labels.
2. Record dataset query, source revisions, exclusion rules, and hashes.
3. Split chronologically with embargo where leakage is possible.
4. Train reproducibly with fixed environment and seeds.
5. Evaluate against current production and simple baselines.
6. Check calibration, cohort stability, drift, latency, and risk metrics.
7. Register candidate; require explicit approval for shadow/canary/production.
8. Monitor and roll back on breached thresholds.

## Leakage controls

- Features use event time and availability time.
- Labels cannot enter feature transforms.
- Overlapping horizons use purging/embargo.
- Preprocessing fits on training folds only.
- Replay reconstructs the exact feature version available then.

## Promotion gates

A candidate must have sufficient samples, improve predefined out-of-sample criteria, avoid material subgroup degradation, meet calibration and latency thresholds, and include a model card. Failed gates keep the deterministic path active.

## Monitoring

Track input schema, missingness, feature distribution drift, output drift, calibration, realized outcomes, cohort degradation, inference errors, and latency. Alerts never trigger unreviewed retraining or deployment.
