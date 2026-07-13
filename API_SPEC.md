# API Specification

## Conventions

- Base path: `/api/v1`; JSON uses `snake_case`; timestamps are ISO 8601 UTC.
- Auth: bearer access token plus secure refresh flow.
- Pagination: opaque cursor with stable ordering.
- Mutation retries: `Idempotency-Key` where documented.
- Error envelope: `{ "error": { "code", "message", "details", "correlation_id" } }`.
- Breaking changes require a new API or event major version.

## Resource groups

| Method/path                                                                          | Purpose                                        |
| ------------------------------------------------------------------------------------ | ---------------------------------------------- |
| `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout` | Identity lifecycle                             |
| `GET /me`                                                                            | Current user and workspace context             |
| `GET /instruments`, `GET/POST /watchlists`                                           | Instrument discovery and configuration         |
| `GET /market/bars`, `GET /market/status`                                             | Historical data and freshness                  |
| `GET /indicators`, `GET /regimes`, `GET /signals`                                    | Versioned analytical outputs                   |
| `GET /decisions`, `GET /decisions/{id}`                                              | Decisions and contributions                    |
| `GET/POST /trades`, `PATCH /trades/{id}`, `POST /trades/{id}/events`                 | Journal lifecycle                              |
| `GET/POST /paper/accounts`, `POST /paper/accounts/{id}/reset`                        | Paper account lifecycle                        |
| `GET/POST /paper/orders`, `POST /paper/orders/{id}/cancel`                           | Submit/cancel simulated orders                 |
| `GET /paper/positions`, `GET /paper/fills`, `GET /paper/equity`                      | Simulated portfolio and execution history      |
| `POST /replays`, `POST /replays/{id}/control`, `GET /replays/{id}`                   | Replay creation and control                    |
| `GET /statistics`                                                                    | Metric query with cohort and window parameters |
| `GET /plugins`, `POST /plugins/install`, `PATCH /plugins/{id}`                       | Plugin lifecycle                               |

OpenAPI is generated and contract-tested once implementation begins.

## Implemented market data slice

- `GET /api/v1/instruments` returns normalized lite-mode instruments.
- `GET /api/v1/market/bars?instrument_id=...&timeframe=5m&limit=...` returns bounded normalized bars. Use `as_of=...` to return only bars that had closed by that timestamp.
- `GET /api/v1/market/status?instrument_id=...&timeframe=5m` returns freshness, latest bar time, gap count, and source.
- `POST /api/v1/market/bars/import` accepts CSV candles for lite-mode historical import. Required headers are `instrument_id,timeframe,open_time,open,high,low,close,volume`; optional `source` and `revision` make imports idempotent.
- `GET /api/v1/indicators?instrument_id=...&timeframe=5m&as_of=...` calculates point-in-time EMA, RSI, and ATR values from closed bars only.
- `GET /api/v1/regimes?instrument_id=...&timeframe=5m&as_of=...` classifies trend and volatility with explanation reasons from point-in-time indicators.

## Implemented replay slice

- `POST /api/v1/replays` creates an authenticated, workspace-owned run with bounded training/evaluation windows, minimum samples, and starting equity.
- `POST /api/v1/replays/{id}/control` accepts `start`, `pause`, `step`, `seek`, and `set_speed`; lite-mode `start` completes synchronously over the bounded local dataset.
- `GET /api/v1/replays/{id}` returns pinned identity, cursor, replay time, status, baseline summaries, and decision/outcome counts.
- `GET /api/v1/statistics?replay_id=...` returns versioned replay-only metrics, eligibility, modeled-cost disclosure, calibration, and required cohort segments.
- Replay resources use deny-by-default bearer authentication and appear not found across workspace boundaries.

## WebSocket

Connect at `/api/v1/stream`. Client messages subscribe/unsubscribe to authorized topics such as `market.bar`, `indicator.value`, `decision.published`, `replay.event`, and `system.health`. Each server message uses the architecture event envelope and includes a monotonically increasing connection sequence number. Clients detect gaps and resynchronize over HTTP.

Paper trading additionally publishes authorized `paper.order`, `paper.fill`,
`paper.position`, and `paper.equity` events. Every paper mutation requires an
idempotency key and returns an explicit `execution_mode: "paper"` field.

## Paper execution rules

Paper orders never call a broker adapter. Market orders fill using the next
eligible market observation after simulated latency; limit and stop orders require
the market to trade through their trigger under a documented bar/tick policy.
Fees, spread, slippage, liquidity limits, partial fills, trading-session rules,
and rejection reasons are versioned configuration. When the available data cannot
determine execution order inside a bar, the simulator uses a declared conservative
policy rather than choosing the profitable path.

## Query safety

Market and statistics endpoints require bounded time windows. Expensive exports and replay runs are asynchronous resources. Rate-limit headers communicate quota state.
