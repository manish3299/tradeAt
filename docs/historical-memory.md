# Historical Memory

Historical memory answers one bounded question: which earlier setups, known at the requested point in time and produced by the same versions, are most comparable to the current context?

## Snapshot contract

Each immutable snapshot stores workspace, instrument, timeframe, observation and availability times, session, regime, setup, decision direction, transparent numeric features, optional outcome, exact feature/regime/decision/policy versions, dataset hash, origin, and input range. The deterministic snapshot hash makes capture idempotent.

An outcome-bearing snapshot is unavailable until its close time. Queries filter `available_at <= as_of` before scoring and require the candidate observation to precede the target. This prevents current-state or late-outcome leakage.

## Similarity and cohorts

`historical-memory-v1` uses Euclidean distance over disclosed momentum percent, range percent, volume ratio, and decision score differences. Results sort by distance and then immutable ID, making ties stable. Retrieval is limited to 50 matches and exact version equality; it never silently mixes strategy generations.

The response includes each feature contribution, distance, versions, provenance, and outcome availability. The cohort reports total matches separately from known outcomes, mean return in R when defined, and a simple 95% mean interval only with at least two outcomes. These are contextual observations, not predictions or guarantees.

## Capture and isolation

Completed replays capture memories through the same point-in-time decision results and modeled outcomes. The API authenticates the workspace before storage access, and the store filters workspace and availability time before returning candidates. Tests cover future-outcome exclusion, version isolation, tenant isolation, deterministic ordering, invalid availability times, and replay-to-dashboard integration.
