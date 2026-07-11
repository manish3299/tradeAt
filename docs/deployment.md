# Deployment Runbook Notes

For laptop development, run with `DEPENDENCY_MODE=lite` and no local containers. Before staging or production rollout, switch to `DEPENDENCY_MODE=external` and confirm artifact revision, configuration validation, secret references, migration compatibility, recent backup, rollback artifact, dashboards, alerts, and on-call ownership. After rollout verify liveness/readiness, login, historical query, streaming freshness, worker lag, error/latency SLOs, and a bounded replay. Record deviations and recovery actions.
