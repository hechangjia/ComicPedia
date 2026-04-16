#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${ROOT_DIR}" ]]; then
  echo "accuracy-smoke must be run inside a git repository."
  exit 1
fi

cd "${ROOT_DIR}"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required but was not found in PATH."
  exit 1
fi

BASE_URL="${SMOKE_BASE_URL:-}"
SERVER_PID=""
SERVER_LOG=""

cleanup() {
  if [[ -n "${SERVER_PID}" ]] && kill -0 "${SERVER_PID}" >/dev/null 2>&1; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
    wait "${SERVER_PID}" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

if [[ -z "${BASE_URL}" ]]; then
  PORT="${SMOKE_PORT:-3101}"
  BASE_URL="http://127.0.0.1:${PORT}"
  SERVER_LOG="$(mktemp -t comicpedia-accuracy-smoke.XXXXXX.log)"

  echo "Starting local Next dev server on ${BASE_URL}"
  pnpm exec next dev --port "${PORT}" >"${SERVER_LOG}" 2>&1 &
  SERVER_PID="$!"

  for _ in $(seq 1 90); do
    if curl -fsS "${BASE_URL}/api/health" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  if ! curl -fsS "${BASE_URL}/api/health" >/dev/null 2>&1; then
    echo "Failed to start local server for accuracy smoke."
    echo "Server log: ${SERVER_LOG}"
    tail -n 80 "${SERVER_LOG}" || true
    exit 1
  fi
else
  echo "Using existing smoke server: ${BASE_URL}"
fi

RUN_ACCURACY_SMOKE=1 SMOKE_BASE_URL="${BASE_URL}" \
  pnpm vitest run src/__tests__/accuracyGoldenTopicSmoke.live.test.ts
