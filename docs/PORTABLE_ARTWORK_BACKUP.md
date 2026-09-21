# Portable artwork archives (v2)

## Scope and compatibility

The settings page exports a ZIP containing live task, character, series and character-relation records, plus referenced local/inline PNG, JPEG, WebP and GIF bytes (including nested historical versions). Identical image bytes are stored once by SHA-256. Raw persisted record columns are used instead of lossy client-facing serializers.

This is **not a full server or disaster-recovery clone**. Configuration and its secrets, queue jobs, recycle-bin records, temporary exports and application binaries are excluded. Structured credential/execution-token fields and opaque script replay payloads are omitted. Private story text, image content and user-authored metadata remain private data; field filtering does not promise forensic secret discovery in arbitrary prose. Use trusted, privately held archives.

- Format: `comicpedia-artwork`, version 2. `manifest.json` plus `assets/<sha256>.<ext>`.
- Explicit budgets: 100 MiB ZIP, 8 MiB manifest, 20 MiB per image, 256 MiB declared expanded ZIP, 2,050 entries, 50,000 records, nesting depth 64.
- No arbitrary remote-image fetches. Missing, unsupported or external referenced images abort export rather than producing a deceptively complete archive.
- Current database column sets must match. This version has no schema migration engine and is not promised to restore into arbitrary older/future releases.
- Legacy `/api/backup/export` remains a read-only JSON extract, requires the configured admin token, strips recognized credential fields and marks the response `legacy-json-not-portable`. Its local-image references are not a portable media backup.
- Legacy `/api/backup/import` returns **410**, without database writes. Preserve old JSON files; use the original installation to export v2 ZIP. An orphaned old JSON without the original media cannot reconstruct missing images. There is not yet an automatic v1 converter.

## Recovery workflow

1. Pause generation/review and wait for in-flight operations to finish. Active task/job states and persisted review/repair running flags block archive operations.
2. Export the current target before replacing any records. Store the downloaded ZIP privately.
3. In a disposable/fresh instance, choose **选择 ZIP 并预览**. This reads and verifies bytes without writing entities or media. If `ADMIN_TOKEN` is configured, supply it in the optional password field. It stays in component memory, not browser storage; it is not a model API key.
4. Check counts, image bytes and conflict IDs. No conflicts means add; conflicts require a separate unchecked-by-default replacement checkbox. Records absent from the archive are retained.
5. Confirm restore. Any change to artwork/jobs/image registry since preview invalidates the revision; preview again instead of overwriting newer data.
6. Open the recovered work and check images. Paused generation is restored to a manual-ready state; old jobs/execution leases are not resumed. A server or browser interruption may leave the outcome unknown; inspect the target before retrying.

## Transaction and filesystem boundary

The restore uses one SQLite `BEGIN IMMEDIATE` transaction for all four entity families, imported-task job invalidation and image registration. Replacement uses UPSERT, not delete-then-insert. A target revision is checked again inside that transaction. A failure in the final registry write rolls back earlier entity writes.

Images are written under a new random `images/restore_<uuid>` namespace with exclusive creation, then referenced by new registry keys. Existing media is not overwritten or removed. A caught failure removes only that newly created, boundary-checked directory. This is not a distributed SQLite/filesystem transaction: a process crash before commit can leave orphan files. Repeated confirmed replacement retains old image files; automatic reference-counted cleanup of these namespaces is deferred.

An export takes a read transaction snapshot, packages referenced bytes, then checks the data revision and rereads files before returning. This detects changes during packaging; it is not a global maintenance lock against hostile external filesystem writers.

## HTTP boundary

`GET /api/backup/archive` returns ZIP bytes with `Cache-Control: no-store`; the UI assigns the download filename. Do not add attachment Content-Disposition to this fetch endpoint: the tested browser transport intercepted it as an empty 204 response. The client now refuses empty/non-ZIP successful responses before claiming success.

`POST /api/backup/archive?action=preview|restore` uses `application/zip` and `X-ComicPedia-Archive: 2`. Restore additionally requires `X-Archive-Revision` and optionally `X-Archive-Replace: true`. Uploads are bounded while streaming, not only by trusting Content-Length. ZIP central-directory paths, duplicates, declared budgets, actual per-entry output, record types/references, assets and hashes are checked before mutation. Hashes detect corruption, not authorship or authenticity.

Both read and write enforce `ADMIN_TOKEN` when configured and reject cross-site Origin/Fetch-Metadata requests. No token is required in the existing local single-user mode. This is not a complete project-wide authentication system and does not make the entire app safe to expose to the public Internet.

## Verification

Evidence is in the ignored `.codex/portable-backup-2026-09-21/` folder. All automated and browser fixtures use isolated storage, not the user's `data/`. No new dependencies or real model calls are used.

- Codec tests: byte deduplication, credential/replay exclusion, missing/corrupt/unsafe entries, bad version/IDs/MIME, external raw-column avatar rejection and decompression bounds.
- Native SQLite/filesystem tests: fresh-record restore plus re-export, raw metadata preservation, read-only preview, explicit conflicts, stale revisions, active task/job/review guards, nested schema validation, paused-work normalization and final-registry fault rollback with old media retained.
- HTTP/UI tests: admin auth, same-origin boundary, streaming limits, safe error responses, preview versus commit, replacement controls, scope disclosure and empty-download rejection.
- Final production/browser outcomes are appended after execution, not inferred from unit-test success.
