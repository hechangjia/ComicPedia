# Changelog

All notable changes to this project will be documented in this file.

## [0.1.1] - 2026-04-05

### Added
- Durable server-side comic generation orchestration with task/job persistence, replay payloads, panel-first image queue controls, queue reconciliation, and ComfyUI recovery tracking.
- Accuracy closed-loop infrastructure including provider management, layered research, fact-pack grounding, and golden-topic smoke coverage.
- Visual diagnosis and repair workflow with diagnosis state persistence, workbench UI, rewrite/patch actions, and richer result-page review surfaces.
- Character relation and series continuity tooling including relation APIs, graph UI, arc snapshots, episode proposal flows, and continuity-aware scripting context.
- Generation presets, advanced settings, history filters/navigation helpers, richer gallery and homepage surfaces, and expanded export/result UI support.

### Changed
- Moved task creation and script execution onto the server runtime, while keeping image generation, review, and recovery flows resumable across refreshes and restarts.
- Reworked script/image/review orchestration so image output is durably saved before panel attachment and deep review can pause, resume, and recover cleanly.
- Split large client and LLM modules into more focused submodules, and aligned more UI surfaces with the repo design-token system.

### Fixed
- Hardened ComfyUI polling, prompt-id persistence, local cold-start handling, and replay behavior after queue failures or stale task recovery.
- Restored history/result review metadata needed for badges, queue summaries, and return navigation under filtered history views.
- Tightened task-route persistence contracts, request validation, image provider handling, queue selection behavior, and attach-failed panel normalization.
