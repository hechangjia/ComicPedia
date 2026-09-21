# Development and verification

## Safe local storage

`COMICPEDIA_DATA_DIR` optionally selects the physical directory for SQLite, images, trash and demo seed data. With no override the application retains `./data`. Persisted image references use logical `data/images/...` paths so new databases can be moved with their image directory. Existing absolute image paths are accepted only inside the configured media boundary.

Do not point test or build verification at real user data. Vitest setup allocates a fresh temporary data directory for every test file, regardless of inherited configuration. The database module refuses the default runtime directory in test mode without an explicit directory. Suite teardown closes all tracked SQLite connections before removing its exact temporary directory. Individual tests that create additional databases must close their handles before deleting their fixtures.

## Commands

```powershell
pnpm test
pnpm typecheck
pnpm lint
$env:COMICPEDIA_DATA_DIR = Join-Path (Get-Location) '.codex/verification-data'
pnpm build
```

The current Windows checkout has a better-sqlite3 native binding compiled for Node 20. Verified local commands used a temporary Node 20.20.2 / pnpm 9.15.9 runtime:

```powershell
npx --yes --package=node@20.20.2 --package=pnpm@9.15.9 -c "pnpm test && pnpm typecheck && pnpm lint && pnpm build"
```

This is a reproducibility note, not the final supported-runtime policy: supported Node and dependency versions remain part of the broader refactor. Do not silently change the machine's default Node version or rebuild native modules while another runtime is using them.

CI now declares Ubuntu and Windows verification with lint, typecheck, tests and build. This configuration has not yet run on GitHub; local Windows results do not prove remote CI success.

## Live accuracy smoke tests

Ordinary tests never invoke live providers. To explicitly run the existing live accuracy suite, provide a private version-2 API configuration file via `SMOKE_CONFIG_PATH`, plus the existing `SMOKE_BASE_URL` or script-managed server settings. Keep that JSON outside tracked files (for example inside the ignored `.codex` directory). It may contain credentials and must not be committed or printed.

The smoke test reads this explicit configuration, not the runtime SQLite database. Reports default to `.codex/smoke-reports`; `SMOKE_REPORT_DIR` can select another private output directory. `RUN_ACCURACY_SMOKE=1` explicitly opts into provider requests and possible cost. Text-only smoke success is not proof of VLM or image-generation capability.

## Storage regression coverage

- Windows-safe database close/reopen and ownership surviving module resets.
- Refusal to implicitly use runtime data during tests.
- Single-component storage identifiers, lexical path bounds, junction rejection.
- Missing-key cache refresh after write and after trash/restore.
- Existing trash copies are not overwritten; canonical and migrated groups are preflighted together.
- Bulk delete rejects malformed identifiers before I/O and preserves restorable task metadata.
- Single delete preserves the live record when its image transfer fails.
- Real SQLite/filesystem/API restore roundtrip verifies returned PNG bytes, not only mock calls.
- Image registry path reads use the same boundary as direct storage reads.

Remaining authorization, generation lifecycle, provider, export and UI work is tracked in `REFACTOR_PROGRESS.md`; these regressions do not constitute complete application security or full refactor acceptance.
