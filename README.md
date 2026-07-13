# TradeAt

TradeAt is a modular, low-latency market analysis and trading decision-support platform. It combines live and historical market data, configurable indicators, explainable decision scoring, replay, journaling, and performance analytics.

This repository is the engineering source of truth. Milestone 1 provides the runnable platform foundation.

## Start here

1. Read [TRADEAT_BIBLE.md](TRADEAT_BIBLE.md).
2. Read [ROADMAP.md](ROADMAP.md).
3. Read [CODING_STANDARDS.md](CODING_STANDARDS.md).
4. Use the matching file in `prompts/` for the active milestone.

## Product boundaries

- Decision support, research, replay, and journaling are in scope for v1.
- Live market ingestion is in scope; unattended order execution is not.
- Every decision must be reproducible and explainable from stored inputs.
- Financial outputs are informational and must expose data freshness and uncertainty.

## Planned layout

- `backend/`: API, domain, ingestion, analytics, replay, and persistence services.
- `frontend/`: browser application and UI component system.
- `docs/`: focused technical references.
- `prompts/`: milestone briefs and Codex operating rules.

## Local development

Prerequisites: Node.js 22+ and npm 10+. The default setup uses lightweight local dependency probes, so Docker, PostgreSQL, and Redis are not required on a development laptop.

```powershell
Copy-Item .env.example .env
npm install
npm run db:migrate
npm run dev
```

The API listens on `http://127.0.0.1:3000`; the frontend listens on Vite's displayed local URL. Liveness is `GET /health/live`; readiness is `GET /health/ready`. With the default `DEPENDENCY_MODE=lite`, readiness verifies the local runtime path and returns HTTP 200 without external services.

Use `DEPENDENCY_MODE=external` only when running against managed PostgreSQL and Redis. In that mode, `DATABASE_URL` and `REDIS_URL` are required and readiness returns HTTP 503 when either service is unavailable.

Run the complete local quality gate with `npm run check`. Production-style backend startup is `npm run build` followed by `npm start`. Environment variables are validated at startup; `.env` is intentionally not loaded implicitly in production code.

## Status

Milestones 1 through 10 are implemented. Production release evidence remains tracked in [ROADMAP.md](ROADMAP.md) and [docs/release-checklist.md](docs/release-checklist.md).

## License

See [LICENSE.md](LICENSE.md).
