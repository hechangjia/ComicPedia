# Comic Generation Orchestrator Design

Date: 2026-04-05
Status: Validated in brainstorming
Scope: Redesign the comic generation pipeline around service-side orchestration, panel-level image jobs, durable persistence, and a smoother result-page workflow

## 1. Context

ComicPedia's current generation chain spans topic research, script generation, image generation, lightweight visual feedback, and optional deeper visual review. The current implementation already has useful building blocks, but the execution model is fragmented:

- `src/lib/client/taskLifecycle.ts` orchestrates the main flow from the client side.
- `src/lib/client/phases/imageGen.ts` runs image generation as a fixed-concurrency fan-out over remaining panels.
- `src/lib/client/db.ts` treats IndexedDB as the high-frequency write path and only syncs terminal task states to the server.
- `src/app/api/comfyui/route.ts` can successfully drive local ComfyUI generation, but the returned image still depends on the client pipeline finishing attachment and task persistence.
- `src/hooks/useTaskSubscription.ts` and zombie recovery logic try to patch over lost in-memory execution after reload or exit.

The user-reported pain points map to three underlying problems:

1. Reliability is weak at the attachment boundary.
   Even if a provider already generated an image, the image can still fail to be durably attached back to the task.
2. Configuration and execution feel fragmented.
   Research, script, image generation, lightweight checking, and deep review behave like separate systems rather than one coherent workflow.
3. Result-page interaction is too coarse.
   After script generation, the user effectively gets a large "generate everything" path instead of panel-level control.

The user wants this redesign prioritized in the following order:

1. Smooth orchestration and experience
2. Reliability and persistence
3. Better image-generation control and scheduling

The preferred product direction is:

- Base model: stage-based but smooth
- Absorb from auto-drive: automatic progression where helpful
- Pause model: fully configurable per stage
- Exit behavior:
  - Research and script continue on the server
  - Image generation pauses after the current in-flight panel finishes and persists
  - Deep visual review pauses and can resume later
- Image generation default after script: do not auto-start
- Visual review model:
  - Lightweight check runs automatically after each generated image
  - Deep review is manual, resumable, and can run on one panel, selected panels, or the full comic
- Local ComfyUI flow: requires a calibration-first path by default

## 2. Goals

### Primary goals

- Move workflow authority from client memory to a service-side orchestrator.
- Define a durable success model for generated images so "provider succeeded but task lost the result" is no longer an accepted failure mode.
- Replace all-or-nothing image generation with panel-level queue operations.
- Make result-page interaction feel like a controlled workspace instead of a single large batch action.
- Reduce configuration burden through presets plus advanced controls instead of exposing fragmented low-level settings by default.

### Secondary goals

- Make pause, resume, and recovery states explicit and understandable.
- Support different scheduling behavior for local ComfyUI vs cloud image providers.
- Preserve compatibility with the current two-phase mental model:
  - script first
  - images later

## 3. Non-Goals

- This change does not redesign the entire visual language of the app.
- This change does not replace every provider integration at once.
- This change does not create a fully autonomous end-to-end AI self-healing generation loop.
- This change does not attempt to clean up every historical UI inconsistency unrelated to the generation pipeline.

## 4. Design Principles

1. Server truth over client optimism.
   Task truth must live on the server; the client may cache and render it, but must not define it.
2. Durable image first, task attachment second.
   If an image exists, the system must prefer preserving it and reconciling attachment later instead of dropping it.
3. Panel-level isolation.
   Each panel image job is independently queueable, retryable, persistable, and recoverable.
4. Explicit handoff points.
   Users should always understand whether the workflow is running automatically, waiting for them, paused, or blocked by a recoverable issue.
5. Preset-first UX.
   The default interaction should be high leverage; advanced controls should exist without becoming the default burden.

## 5. Proposed Architecture

### 5.1 High-level structure

Introduce a service-side comic generation orchestrator with three responsibilities:

1. Own the task state machine
2. Dispatch background workers for each phase
3. Persist every meaningful state transition and recovery checkpoint

The frontend becomes a console for:

- creating tasks
- selecting presets and advanced overrides
- viewing live status
- triggering panel-level actions
- pausing and resuming recoverable work
- launching deep review intentionally

The backend gains an orchestration layer above the existing provider adapters and phase logic.

### 5.2 Main subsystems

- Task orchestrator
  - Owns stage progression and transition rules
- Research/script worker
  - Runs background research and script generation
- Image queue manager
  - Maintains durable panel-level jobs
- Image persistence and attachment layer
  - Separates file durability from task attachment
- Lightweight visual check worker
  - Runs automatically after each successful image attachment
- Deep review worker
  - Runs only on explicit user command and supports pause/resume
- Reconcile worker
  - Repairs attachment and state inconsistencies

## 6. State Model

### 6.1 Task-level states

Task-level states should represent phase ownership and user-visible handoff points:

- `created`
- `research_running`
- `script_running`
- `script_ready`
- `calibrating`
- `image_queue_running`
- `image_queue_paused`
- `deep_review_running`
- `deep_review_paused`
- `completed`
- `failed`

These task-level states replace the current overly broad model where many distinct situations collapse into `generating`, `script_ready`, or `failed`.

Not every task must visit every state:

- tasks using cloud image providers may skip `calibrating`
- `completed` means no mandatory work is still running
- deep review remains optional; if the user starts deep review from a completed task, the task may temporarily enter `deep_review_running` and then return to `completed`

### 6.2 Panel job states

Each panel image job should have its own state:

- `queued`
- `calibrating`
- `generating`
- `persisting`
- `light_check`
- `paused`
- `attach_failed`
- `failed`
- `completed`

This state split is required so the system can tell the difference between:

- provider failed to generate
- image generated but has not persisted yet
- file persisted but panel attachment failed
- image is attached but lightweight review is still running

`light_check` only begins after attachment succeeds; it must never hide an attachment failure under a generic review-running label.

### 6.3 Exit and recovery semantics

When the user leaves the page, reloads, or the browser process disappears:

- Research and script continue server-side.
- Image generation stops accepting new jobs.
- The currently running image job is allowed to finish, persist, and attempt attachment.
- Remaining image jobs transition to paused.
- Deep review transitions to paused and can later resume explicitly.

This yields the exact behavior the user requested:

- research/script continue
- images pause after the in-flight panel
- VLM deep review pauses and resumes later

## 7. Success Definition for Generated Images

The user chose the following rule:

- priority 1: ensure the image is not lost
- priority 2: complete task attachment and final state consistency

Therefore one generated image must be processed in this order:

1. Provider returns image output
2. Server persistence layer stores the image durably and returns a stable file reference
3. Panel record and image version history are updated in the task record
4. Task and panel state are marked completed
5. Client is notified

If step 2 succeeds but steps 3-5 fail, the system must not drop the image. Instead:

- record the durable output reference
- mark the panel job as `attach_failed`
- enqueue a reconcile action to finish attachment later

This is the central reliability change of the redesign.

## 8. Result Page Workflow

### 8.1 Default post-script behavior

After script generation completes, the result page opens into a workspace state:

- the script and panels are visible immediately
- no image generation starts automatically by default
- panel cards become the primary work surface

### 8.2 Primary image actions

The result page should replace the current large-batch default with these first-class actions:

- `Generate This Panel`
- `Generate Selected`
- `Continue Remaining`

Advanced-only actions:

- `Re-run All`
- `Recalibrate`
- `Skip Failures and Continue`

This directly addresses the user's complaint that the current flow only offers a one-shot full-batch generation path after scripting.

### 8.3 ComfyUI calibration-first flow

For local ComfyUI, the default workflow must be:

1. user selects a panel or a small seed set
2. system generates a single calibration image
3. user approves or adjusts
4. only then may the queue continue to remaining selected panels

Rationale:

- local ComfyUI drift is costly
- large batch failure is expensive
- a calibration checkpoint avoids wasting time and compute

### 8.4 Visual review layering

Lightweight visual checking:

- runs automatically after each image attaches successfully
- provides low-friction status feedback
- must not block the user with heavy modal interruption

Deep review:

- is never auto-started
- can be run on one panel, selected panels, or the full comic
- supports pause and resume

This combines the user's preference for a layered review model:

- D: split lightweight review and deep review
- plus C: deep review should remain user-driven

## 9. Configuration Model

### 9.1 Preset-first design

The configuration entry should default to a small set of high-leverage presets:

- `Local ComfyUI Calibrated`
- `Balanced Auto`
- `High Quality Review`
- `Fast Draft`

Each preset defines defaults for:

- research on/off
- script generation behavior
- pause-after-script behavior
- calibration requirement
- image queue mode
- provider-aware concurrency
- lightweight check auto-run
- deep review default entry visibility

### 9.2 Advanced overrides

Advanced settings should be grouped by stage:

- Research
- Script
- Image Queue
- Lightweight Check
- Deep Review

The advanced UI should expose behavior controls, not raw provider payloads.

### 9.3 Task config snapshot

When a task is created, the effective preset and advanced overrides must be frozen into task metadata. Historical tasks must remain explainable even if the user's global configuration changes later.

This snapshot should at minimum record:

- preset id
- research/script/image/review execution settings
- image provider and model
- whether calibration was required and whether it was approved
- concurrency policy selected for that task

## 10. Scheduling Strategy

### 10.1 Provider-aware queueing

Image scheduling must no longer be a fixed fan-out concurrency number applied equally to every provider.

Recommended default strategy:

- Local ComfyUI
  - single-flight by default
  - no remaining queue progression before calibration approval
  - post-calibration default concurrency `1`, optional maximum `2`
- Cloud image providers
  - allow higher concurrency
  - still use queue-controlled dispatch rather than immediate all-panel fan-out

### 10.2 Why not keep the current model

The current model in `src/lib/client/phases/imageGen.ts` uses a fixed concurrency fan-out over pending panels. That is acceptable for a small optimistic client flow, but it is a poor default for local ComfyUI and directly contributes to brittle batch behavior.

The redesign replaces this with durable queue semantics rather than only tweaking the concurrency number.

## 11. Persistence and Recovery

### 11.1 Authority

The service-side task record becomes the only authority.

Client-side caches may exist for responsiveness, but:

- they do not define truth
- they do not own recovery semantics
- they must not be the only place where in-progress work exists

### 11.2 Durable units

Each image job should store durable metadata such as:

- `jobId`
- `taskId`
- `panelIndex`
- `status`
- `attemptCount`
- `provider`
- `model`
- `promptSnapshot`
- `outputFileKey`
- `lightCheckStatus`
- `lastError`

### 11.3 Reconciliation

Add a reconcile path that repairs these inconsistencies:

- file exists but panel attachment is missing
- panel is stuck in a running state but the worker is gone
- task claims paused but still has no active or resumable jobs
- task says generating while only persisted outputs remain

This reconcile path is the formal solution to the current "ComfyUI succeeded but the comic never got the image back" class of issue.

## 12. Error Handling Model

Split failures into distinct categories:

- `provider_error`
- `persistence_error`
- `orchestration_error`
- `review_error`

Each category should map to explicit recovery actions.

Panel-level recovery actions:

- `Retry Panel`
- `Reattach Output`
- `Restore Last Successful Version`

Task-level recovery actions:

- `Resume Remaining Queue`
- `Resume Deep Review`
- `Continue Without Failed Panels`

The user should never need to restart the entire comic just because one attachment or one panel failed.

## 13. Testing Strategy

### 13.1 State-machine tests

Cover at least:

- `created -> research_running -> script_running -> script_ready`
- `script_ready -> calibrating -> image_queue_running`
- `image_queue_running -> image_queue_paused`
- `deep_review_running -> deep_review_paused`
- terminal completion and terminal failure transitions

### 13.2 Persistence and reconcile tests

Cover:

- file persisted but task attachment failed
- task persisted but client notification failed
- stuck running state after worker loss
- reattach flow after durable output already exists

### 13.3 Exit and resume tests

Cover:

- research/script continue after page exit
- image queue accepts no new jobs after exit
- in-flight image completes and persists before pausing
- deep review resumes correctly

### 13.4 UX and integration tests

Cover:

- script-ready page shows panel-first actions
- no default auto-start image generation
- `Generate This Panel`, `Generate Selected`, and `Continue Remaining` all behave correctly
- ComfyUI calibration approval gates remaining queue execution
- lightweight check auto-runs after each image attachment

## 14. Rollout Plan

This implementation should follow the same phased, high-leverage-first style as the approach captured in [docs/ai/design-system-implementation-plan.md](/home/chia/gitrepo/ComicPedia/docs/ai/design-system-implementation-plan.md): land the foundational behavior first, then expand outward.

### Phase 1: Orchestrator foundation

- Introduce service-side task orchestration ownership
- Define new task and panel job state models
- Add durable image success flow
- Add reconcile support for attach failures
- Replace result-page primary actions with panel-first controls

### Phase 2: Queue behavior and recovery

- Add provider-aware scheduling
- Add ComfyUI calibration-first flow
- Add leave-page pause behavior for image jobs
- Add explicit resume/recover actions
- Add lightweight automatic visual checks

### Phase 3: Review and UX consolidation

- Add resumable deep review flows
- Land presets plus advanced grouped settings
- Improve error affordances and recovery actions
- Polish timeline, queue, and status visibility

## 15. Trade-off Summary

### Chosen direction

Service-side orchestration with panel-level durable jobs

### Rejected alternatives

Frontend patch-only approach:

- too small to solve the authority and reliability problem

Half-migrated hybrid approach:

- creates long-lived split execution semantics
- keeps the most failure-prone phase partially client-owned

### Why the chosen direction is correct

It is the only approach that satisfies the validated product rules together:

- research/script continue off-page
- images pause after the current panel completes
- deep review pauses and resumes
- local ComfyUI uses calibration-first
- image success prioritizes durability before task consistency
- result page becomes panel-driven instead of batch-driven

## 16. Implementation Readiness

This spec is intentionally narrow enough to support one implementation plan, but broad enough to fix the user's real workflow problem rather than papering over a single symptom.

The next step after user review is to write an implementation plan that maps the redesign onto the current codebase, especially these areas:

- `src/lib/client/taskLifecycle.ts`
- `src/lib/client/phases/imageGen.ts`
- `src/lib/client/db.ts`
- `src/app/api/comfyui/route.ts`
- `src/hooks/useTaskSubscription.ts`
- result-page action components and status display
