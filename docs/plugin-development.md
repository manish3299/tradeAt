# Plugin Development Checklist

- Select the smallest plugin type and stable ID.
- Declare compatibility, configuration schema, inputs, outputs, permissions, limits, and determinism.
- Validate configuration without executing the plugin.
- Test warm-up, gaps, duplicates, ordering, extremes, cancellation, timeout, and golden outputs.
- Benchmark representative p50/p95 latency.
- Document formulas/behavior, limitations, emitted quality state, and migration path.
- Register, enable in a test workspace, inspect health, disable, upgrade, and roll back without core edits.
