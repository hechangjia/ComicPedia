# Script lifecycle fencing implementation plan

This implements the already approved lifecycle/authority section of REFACTOR_DISCOVERY_2026-09-19.md. Full refactor scope is unchanged.

- [x] Reproduce delayed script completion after deletion with real SQLite, plus failed-stream fallback and user edits.
- [x] Add server-only per-execution ownership in task metadata. Claims and writes use immediate SQLite transactions; writes update existing rows only and preserve unrelated metadata, replay payload, tags and favorites. Generic task replacement invalidates ownership; deletion/restoration must not revive it.
- [x] Check ownership before/after asynchronous research, enrichment, outline, stream/fallback, repair and deferred image handoff. Superseded execution exits normally without fallback or error writes. Existing remote calls may finish; no remote abort claim.
- [x] Verify deleted/restored/superseded tasks, successful completion, failure, replay preservation and trace persistence. Review same-pattern candidates and record remaining variants without claiming whole-lifecycle completion.
- [x] Run focused/full tests, typecheck, lint, build; document evidence and keep original data unchanged. No commits/push.

No agents delegated. Tests use setup.ts isolated DB, synthetic responses and no real model credentials.

Implementation evidence and remaining whole-goal risks are recorded in SCRIPT_LIFECYCLE.md. Checkboxes refer to this batch only, not the overall goal.
