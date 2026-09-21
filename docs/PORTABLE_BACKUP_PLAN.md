# Portable Artwork Backup Implementation Plan

**Goal:** Implement a verifiable, media-inclusive portable backup and recover it without partial database writes or overwriting live image files.
**Architecture:** Versioned ZIP manifest with SHA-256 assets; strictly bounded parser; server-owned snapshot and atomic record transaction; immutable staged media; preview/revision gate before conflict restore.
**Tech Stack:** Existing Next.js, SQLite, Node filesystem/crypto, JSZip. No new dependencies.
**Spec:** docs/REFACTOR_DISCOVERY_2026-09-19.md sections 4.5-4.6.

## Constraints and scope

- Preserve the user's original data; all tests use disposable COMICPEDIA_DATA_DIR.
- Artwork archive contains live tasks, characters, series, relations and their referenced local/inline images, including versions and nested metadata. Preserve raw persisted columns rather than lossy domain serializers.
- Explicitly not a server clone: settings/secrets, background jobs, recycle bin, temporary exports are excluded. Active executions block archive/restore; restored work cannot silently restart background jobs.
- Do not fetch arbitrary external image URLs. Refuse incomplete archives when referenced local media is missing; report external dependencies rather than imply self-containedness.
- Validate format/schema, paths, entry counts, decompression budgets, asset hashes, IDs, dates and data types before any mutation.
- Preview is read-only; restore revalidates target revision under SQLite immediate transaction. Existing IDs require explicit replacement confirmation.
- Publish only unique new media keys. DB failure rolls back all entity families/image registry and removes only newly created files; never mutate original media.
- Process crash may leave unreferenced staged files; do not claim filesystem and SQLite form one distributed transaction.

## Steps

- [ ] Archive codec and media collection: red/green integrity and rejection tests.
- [ ] Snapshot repository and restore staging: cross-entity rollback, conflict and revision tests.
- [ ] HTTP export, preview, commit and permission/body limits.
- [ ] Settings UI preview, counts, conflict confirmation and accurate scope disclosure.
- [ ] Fresh-target roundtrip, failure injections, full tests/type/lint/build, browser check, cleanup.

Work remains active until every step is verified. No commit/push as part of this implementation.
