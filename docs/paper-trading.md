# Paper Trading and Journal

Milestone 7 is simulation only. No broker port or adapter is accepted by `PaperTradingService`, and every user-visible result carries the `paper` origin. Replay, manual, and future broker results cannot enter the paper aggregate or paper statistics.

## Execution contract

Accounts pin `paper-execution-v1`: one basis point fee, two basis points spread, one basis point adverse slippage, 250 ms latency, ten-percent maximum bar participation, and the conservative `stop_first` intrabar policy. Market, limit, stop, and stop-limit orders are deterministic for the same order and bar inputs. Orders require explicit confirmation and an idempotency key; account equity limits new order notional to 25 percent.

Fills update cash, positions, and journal lifecycle records while appending a ledger transaction whose postings sum to zero. Fees and slippage remain explicit. Account reset closes the current version and appends reset ledger/audit history instead of deleting results.

## Journal and forward statistics

The first position-opening fill creates a PAPER journal trade. Closing fills record exit, duration, costs, and R when initial risk was supplied. Notes, normalized tags, MAE, and MFE can be added without erasing the audit trail. Paper statistics report only closed forward PAPER trades and never combine them with replay outcomes.

## Isolation

Every API authenticates a workspace before reading the tenant-keyed state. Cross-workspace identifiers return not found. Focused tests cover authentication, tenant isolation, idempotency, deterministic fills, ledger reconciliation, risk rejection, reset history, and the absence of any broker dependency.
