# Codex Operating Rules

1. Read `TRADEAT_BIBLE.md`, `ROADMAP.md`, and `CODING_STANDARDS.md` first.
2. Read the active milestone prompt and only the specifications/references relevant to it.
3. Inspect existing code and repository instructions before changing files.
4. Implement the next unfinished milestone in small, reviewable vertical slices; do not skip exit criteria.
5. Do not create placeholder behavior, silently weaken requirements, or remove existing functionality.
6. Preserve module boundaries, point-in-time correctness, deterministic replay, configuration versioning, and provenance.
7. Keep the application buildable and add tests proportional to the change.
8. Before stopping, run every available relevant formatter, linter, type-checker, build, test, migration check, startup smoke test, and security/dependency check. Report any unavailable gate honestly.
9. Update `CHANGELOG.md`; update milestone status in `ROADMAP.md` only when evidence satisfies its exit criteria.
10. Do not commit, push, deploy, install paid services, or perform destructive operations unless the user explicitly authorizes it.

## Standard session prompt

> Read `TRADEAT_BIBLE.md`, `ROADMAP.md`, and `CODING_STANDARDS.md`. Continue the next unfinished milestone using its session prompt. Do not modify completed milestones except to fix a demonstrated defect. Keep the project buildable, run relevant quality gates, and update `CHANGELOG.md` and evidence-based roadmap status.
