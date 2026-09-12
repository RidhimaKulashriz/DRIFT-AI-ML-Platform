#!/usr/bin/env bash
set -euo pipefail

fail=0
need_cmd() {
  if command -v "$1" >/dev/null 2>&1; then
    printf 'OK   %-12s %s\n' "$1" "$(command -v "$1")"
  else
    printf 'FAIL %-12s missing\n' "$1"
    fail=1
  fi
}

need_cmd docker
need_cmd ffmpeg
need_cmd ffprobe
need_cmd curl
need_cmd python3

if command -v docker >/dev/null 2>&1; then
  docker info >/dev/null 2>&1 && printf 'OK   %-12s daemon reachable\n' docker || { printf 'FAIL %-12s daemon unavailable\n' docker; fail=1; }
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  printf 'WARN %-12s DATABASE_URL is unset in the host shell; Compose supplies it to the worker.\n' env
else
  printf 'OK   %-12s DATABASE_URL is set\n' env
fi

if [[ -z "${RECONSTRUCTION_ARTIFACT_HOST_ROOT:-}" ]]; then
  printf 'WARN %-12s using Compose default ../data/reconstruction\n' artifact-root
else
  printf 'OK   %-12s %s\n' artifact-root "$RECONSTRUCTION_ARTIFACT_HOST_ROOT"
fi

if [[ "$fail" -ne 0 ]]; then
  printf '\nPreflight failed. Install the missing host dependencies before starting the stack.\n' >&2
  exit 1
fi
printf '\nPreflight passed. Start with: docker compose -f reconstruction-worker/docker-compose.yml up --build\n'
