# Deep-review lifecycle implementation plan

Implements the approved lifecycle/architecture/VLM sections of REFACTOR_DISCOVERY_2026-09-19.md. No reduction of the full goal; no subagents, commits or pushes.

- [x] Reproduce deletion/start race, changed images, paused scoring and superseded execution with real SQLite.
- [x] Add one immediate transactional task/jobs mutation boundary. Create review jobs and update queue state atomically. Claim review execution IDs and compare an input snapshot before every result write; keep unrelated task metadata.
- [x] Reject stale results without calling the next VLM stage; invalidate ownership on pause/resume; preserve targeted report merging and recorded original IDs.
- [x] Separate browser VLM I/O from injectable server I/O; load local stored images on the server, make bounded direct model requests, and report unreadable/failed images rather than successful fake scores in the durable review flow.
- [x] Run real HTTP + real stored-image + SQLite integration, focused/full tests, types/lint/build; document remaining limits and keep original data unchanged.

Batch verification and explicit outstanding goal scope: REVIEW_LIFECYCLE.md (2026-09-21). Browser evidence identifies a separate clean-diagnosis UI labeling issue, not claimed fixed by this batch.
