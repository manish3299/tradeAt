# Replay and Backtest

Replay substitutes only the event source and clock; domain and application calculation paths remain shared with live mode. A replay identity pins the dataset hash, start/end, event-order policy, configuration versions, plugin versions, code revision, and random seed. Its canonical SHA-256 hash is also the immutable output identity.

## Deterministic controls

`ReplayController` orders events by observed time, received time, and event ID. It supports start, pause, step, speed metadata, seek, and compatible checkpoint restore. The injected clock never moves backward, and future events cannot be inspected before replay time reaches them. Seeking resets to the pinned start and deterministically replays forward.

Lite mode persists immutable results through `InMemoryReplayResultStore`. A second, different result cannot replace output already stored for the same replay identity.

Authenticated workspace APIs create runs at `POST /api/v1/replays`, apply start/pause/step/seek/speed controls at `POST /api/v1/replays/{id}/control`, retrieve state at `GET /api/v1/replays/{id}`, and return completed replay metrics from `GET /api/v1/statistics?replay_id=...`. Replay IDs are tenant-isolated and return not found outside their owning workspace.

## Walk-forward evaluation

`BacktestService` exposes only bars that were closed and received by each evaluation time, collapses late revisions only after their receipt, and accepts the same `PublishedDecision` contract used by live decision evaluation. Chronological walk-forward windows keep training bars strictly before evaluation bars. Reports include buy-and-hold and always-abstain baselines.

## Execution policy

An outcome exists only if a later bar trades through the decision entry zone. Entry, spread, per-side slippage, fees, stop, target, end-of-data exit, MAE, and MFE are modeled with a pinned execution version. Stop gaps fill at the worse opening price. If a bar can contain both stop and target without proving their order, the declared `stop_first` policy selects the stop.

The signed-in dashboard exposes training/evaluation window sizes and the minimum-sample gate. Results are permanently labeled `REPLAY`, disclose versions and costs, and show withheld metrics as unavailable until sample eligibility is reached.
