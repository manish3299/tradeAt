# Database Specification

## Platform

PostgreSQL is authoritative. Use migrations, UTC `timestamptz`, UUID/ULID identifiers, and `numeric` for price and money. TimescaleDB may be evaluated only after representative benchmarks.

## Core tables

| Module        | Tables                                                                                     | Notes                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Identity      | `users`, `workspaces`, `memberships`, `refresh_tokens`                                     | Tokens are hashed at rest.                                                                  |
| Configuration | `instruments`, `watchlists`, `watchlist_items`, `config_versions`                          | Instruments are venue-qualified.                                                            |
| Market        | `market_events`, `bars`, `data_quality_incidents`                                          | Raw events append-only; unique provider event key.                                          |
| Plugins       | `plugin_manifests`, `plugin_installations`, `plugin_runs`                                  | Manifest and configuration versions retained.                                               |
| Analytics     | `indicator_values`, `signals`, `regimes`                                                   | Unique by input/version identity.                                                           |
| Decisions     | `decisions`, `decision_contributions`                                                      | Published records immutable.                                                                |
| Journal       | `trades`, `trade_events`, `trade_tags`, `trade_notes`                                      | Events preserve lifecycle history.                                                          |
| Paper trading | `paper_accounts`, `paper_orders`, `paper_fills`, `paper_positions`, `paper_ledger_entries` | Simulation records are broker-isolated and append-only where financial history is involved. |
| Replay        | `replay_sessions`, `replay_checkpoints`, `replay_outputs`                                  | Stores dataset/config/plugin versions and seed.                                             |
| Statistics    | `metric_definitions`, `metric_snapshots`                                                   | Definition version and cohort filters required.                                             |
| Learning      | `datasets`, `model_versions`, `model_evaluations`, `predictions`                           | Point-in-time feature provenance required.                                                  |
| Operations    | `outbox_events`, `idempotency_keys`, `audit_events`                                        | Retention policy per category.                                                              |

## Identity persistence

- `users.email` is unique and stored normalized by the authentication service.
- `sessions.access_token_hash` is unique; raw access tokens are returned once and never stored.
- `refresh_tokens.token_hash` is primary-keyed, consumed on rotation/logout, and reused refresh tokens revoke all active sessions for that user.
- `audit_events` records authentication actions with bounded metadata for operational review.

## Market keys

- Instrument uniqueness: `(venue, provider_symbol, asset_class)`.
- Bar uniqueness: `(instrument_id, timeframe, open_time, source, revision)`.
- Derived value uniqueness: `(instrument_id, timeframe, observed_at, definition_id, definition_version, config_hash)`.
- The first M3 schema slice includes `instruments` and `bars`; prices and volume are stored as decimal text until numeric precision rules are finalized per provider.

## Replay persistence

- `replay_outputs.identity_hash` is the immutable pinned replay identity.
- Saving the same deterministic output is idempotent; a different output cannot replace an existing identity.
- Lite mode uses the equivalent in-memory port, while external mode stores JSONB output with UTC creation time.

## Paper persistence

- `paper_workspace_states.workspace_id` is tenant-keyed and stores the bounded paper aggregate in JSONB for this milestone's modular-monolith transaction boundary.
- The aggregate contains versioned accounts, idempotent orders, immutable fills, positions, balanced ledger transactions, journal lifecycle records, and audit events.
- Lite mode uses the same `PaperStateStore` contract in memory. Later normalization can expand the aggregate into the designed paper tables without changing application contracts.

## Historical-memory persistence

- `historical_snapshots.id` is a deterministic hash of the full immutable point-in-time snapshot.
- `workspace_id` and `available_at` provide deny-by-default tenant and temporal filtering before similarity scoring.
- The JSONB snapshot retains setup, transparent features, regime, decision, optional outcome, exact versions, dataset hash, source origin, and input range.
- Outcome-bearing memories become queryable only at outcome availability time; current state is never backfilled into an earlier query.

## Indexing and partitioning

- Time-series tables index `(instrument_id, observed_at DESC)` and partition by time after benchmark evidence.
- Journal queries index `(workspace_id, opened_at DESC)` and status.
- Paper orders and fills index `(paper_account_id, created_at DESC)`; an account reset closes the current account version rather than deleting its history.
- JSONB is allowed for bounded provider metadata and plugin output extensions, not for core query fields.

## Retention

Retention is configuration-driven and legally/data-license compliant. Deleting a user anonymizes or deletes user-owned data while retaining only operational records required by policy. Backups are encrypted and restore-tested.

## Migration rules

- Migrations are forward-only in deployed environments.
- Use expand/migrate/contract for incompatible schema changes.
- Each migration has a rollback or recovery note and is tested against representative data.

## Paper-trading integrity

- Every order records decision/configuration version, simulation model version, requested quantity, order type, timestamps, and idempotency key.
- Every fill records the source market event/bar, simulated latency, spread, slippage, fee, quantity, and price.
- Cash and position changes create balanced immutable ledger entries; derived balances are reconcilable from the ledger.
- Paper, manual, replay, and any future broker-originated trades use explicit origin fields and are never silently merged.
