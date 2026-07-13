# MVP Dashboard

Milestone 8 combines the trustworthy result path in one signed-in workspace without merging result origins or weakening decision gates.

## Surfaces

- The watchlist changes the bounded five-minute market context with keyboard-operable native buttons.
- The price chart retains only the requested bars and includes a text alternative, range, count, and freshness label.
- Freshness, source, gaps, stale state, loading, empty, partial decision, error, and reconnect/resynchronization states remain visible in text.
- The decision card shows direction or abstention, score, confidence, regime, timestamp, ranked gate details, vetoes, policy version, and reproducibility identity.
- Eligible decisions can prefill only the PAPER side; confirmation remains required before submission.
- Replay results retain the REPLAY label, costs, versions, sample eligibility, and unavailable metrics.
- PAPER account capital, cash, mark-to-market equity, order confirmation, positions, fills, journal notes/tags, and reset history remain simulation-only.
- Core analytics show sample sizes, costs, uncertainty safeguards, and separate REPLAY/PAPER origins.

## Accessibility and responsive behavior

The dashboard provides a skip link, semantic landmarks, labelled controls, a labelled chart image with description, non-color-only statuses, visible focus, reduced-motion behavior, and live-region loading/reconnect messages. The two-column evidence layout collapses at tablet width; metrics and decision summaries collapse to one column on mobile.

## Resynchronization

Market gap or load failure exposes a `Reconnect and resync` control. Resynchronization refetches bars, freshness, indicators, regime, and the latest decision as one bounded context. The decision request uses the latest bar's received timestamp so late data is never treated as historically available before receipt.
