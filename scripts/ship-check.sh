#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || true)"

if [[ -z "${ROOT_DIR}" ]]; then
  echo "ship-check must be run inside a git repository."
  exit 1
fi

cd "${ROOT_DIR}"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required but was not found in PATH."
  exit 1
fi

CURRENT_BRANCH="$(git branch --show-current)"
DEFAULT_BASE="$(git remote show origin 2>/dev/null | sed -n '/HEAD branch/s/.*: //p' || true)"

if [[ -z "${DEFAULT_BASE}" ]]; then
  DEFAULT_BASE="master"
fi

if [[ -z "${CURRENT_BRANCH}" ]]; then
  echo "Unable to detect the current git branch."
  exit 1
fi

if [[ "${CURRENT_BRANCH}" == "${DEFAULT_BASE}" ]]; then
  echo "Refusing to run ship-check from the base branch '${DEFAULT_BASE}'."
  echo "Create or switch to a working branch first."
  exit 1
fi

echo "== ComicPedia ship check =="
echo "Branch: ${CURRENT_BRANCH}"
echo "Base branch: ${DEFAULT_BASE}"

if git rev-parse --verify "origin/${DEFAULT_BASE}" >/dev/null 2>&1; then
  read -r BEHIND_COUNT AHEAD_COUNT <<<"$(git rev-list --left-right --count "origin/${DEFAULT_BASE}...HEAD")"
  echo "Compared with origin/${DEFAULT_BASE}: ahead ${AHEAD_COUNT}, behind ${BEHIND_COUNT}"
fi

echo
echo "Working tree:"
git status --short

echo
echo "Running lint..."
pnpm lint

echo
echo "Running tests..."
pnpm test

echo
echo "Running production build..."
pnpm build

echo
echo "Ship check passed."
echo "Suggested next steps:"
echo "  1. git push origin ${CURRENT_BRANCH}"
echo "  2. gh pr create --base ${DEFAULT_BASE} --head ${CURRENT_BRANCH}"

if [[ "${CURRENT_BRANCH}" == "dev" && "${DEFAULT_BASE}" == "master" ]]; then
  echo "  3. Merge the dev -> master PR after smoke-testing the create/history/result/settings flows."
fi
