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
| `GET /indicators`, `GET /signals`                                                    | Versioned analytical outputs                   |
| `GET /decisions`, `GET /decisions/{id}`                                              | Decisions and contributions                    |
| `GET/POST /trades`, `PATCH /trades/{id}`, `POST /trades/{id}/events`                 | Journal lifecycle                              |
| `GET/POST /paper/accounts`, `POST /paper/accounts/{id}/reset`                        | Paper account lifecycle                        |
| `GET/POST /paper/orders`, `POST /paper/orders/{id}/cancel`                           | Submit/cancel simulated orders                 |
| `GET /paper/positions`, `GET /paper/fills`, `GET /paper/equity`                      | Simulated portfolio and execution history      |
| `POST /replays`, `POST /replays/{id}/control`, `GET /replays/{id}`                   | Replay creation and control                    |
| `GET /statistics`                                                                    | Metric query with cohort and window parameters |
| `GET /plugins`, `POST /plugins/install`, `PATCH /plugins/{id}`                       | Plugin lifecycle                               |

OpenAPI is generated and contract-tested once implementation begins.

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
