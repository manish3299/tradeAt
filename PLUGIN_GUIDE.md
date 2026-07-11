# Plugin Development Guide

## Goal

The normal lifecycle is: **Create → Register → Enable in UI → Done.** Compatible plugins require no core architecture changes.

## Plugin types

- Indicator: observations → versioned numeric/structured values.
- Strategy: market context and signals → evidence or recommendation.
- Data adapter: provider messages → normalized market events.
- Regime classifier: point-in-time observations → regime probabilities/label.
- Statistic: eligible trade/decision cohort → metric result and metadata.

## Manifest

Each plugin declares a stable ID, semantic version, API compatibility range, type, entry point, configuration JSON Schema, required inputs, emitted outputs, permissions, warm-up needs, determinism, and resource limits.

## Runtime contract

- Inputs and outputs are schema validated.
- Plugin context exposes clock, logger, metrics, configuration, and explicitly granted data ports.
- Network/filesystem access is denied unless declared and approved.
- Execution has time, memory, and concurrency limits; failures are isolated.
- Outputs include plugin/version, configuration hash, input range, duration, warnings, and quality state.

## Lifecycle

1. Scaffold from the reference plugin template.
2. Implement the typed contract and configuration schema.
3. Add unit, golden-vector, missing-data, warm-up, and determinism tests.
4. Package and register the signed/checksummed artifact.
5. Validate compatibility and permissions during installation.
6. Enable per workspace/instrument/timeframe in the UI.
7. Observe health, latency, failures, and output drift; rollback by version.

## Compatibility

Core plugin API follows semantic versioning. Additive fields are backwards compatible; removals or semantic changes require a new major version. Installed versions and configurations remain pinned for replay reproducibility.

See `docs/plugin-development.md` for the implementation checklist.
