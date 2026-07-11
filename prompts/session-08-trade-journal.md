# Session 08: Trade Journal

Implement trade lifecycle entities and immutable events, notes/tags, entry/exit and initial-risk validation, fees/slippage fields, R, duration, MAE/MFE inputs, authorization, filters, and audit history.

Also implement broker-isolated paper trading: versioned paper accounts, idempotent market/limit/stop/stop-limit orders, deterministic fills, positions, balanced ledger entries, fees/spread/slippage/latency/liquidity assumptions, risk limits, cancellation/rejection paths, account reset history, and clearly labeled paper-only UI and statistics. Prefilling from a decision is allowed, but submission requires explicit user confirmation by default. Use a conservative declared policy for ambiguous intrabar fills and prove ledger reconciliation, deterministic replay parity, tenant isolation, and that no broker adapter can be invoked.
