#!/usr/bin/env bash
set -euo pipefail

JOB_NAME="${1:-}"
ROOT_DIR="${JPAD_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
ENV_FILE="${JPAD_ENV_FILE:-$ROOT_DIR/.env}"
LOCK_DIR="${JPAD_LOCK_DIR:-/tmp/jpad-scheduled-jobs}"
EXTRA_ARGS=("${@:2}")

has_arg_prefix() {
  local prefix="$1"
  local arg
  for arg in "${EXTRA_ARGS[@]}"; do
    if [[ "$arg" == "$prefix"* ]]; then
      return 0
    fi
  done
  return 1
}

if [[ -z "$JOB_NAME" ]]; then
  echo "usage: $0 <backup|retention|restore-drill|audit-log-deliveries|attachment-security-rescan|semantic-index-jobs|semantic-reindex> [extra args...]" >&2
  exit 64
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required in PATH" >&2
  exit 127
fi

mkdir -p "$LOCK_DIR"

if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK_DIR/${JOB_NAME}.lock"
  if ! flock -n 9; then
    echo "job already running: $JOB_NAME" >&2
    exit 0
  fi
fi

declare -a CMD
case "$JOB_NAME" in
  backup)
    CMD=(bun run backup:run --trigger=scheduled)
    ;;
  retention)
    CMD=(bun run retention:run --trigger=scheduled)
    ;;
  restore-drill)
    CMD=(bun run restore-drill:run --trigger=scheduled)
    ;;
  audit-log-deliveries)
    CMD=(bun run audit-log:deliveries --trigger=scheduled)
    if ! has_arg_prefix "--limit="; then
      CMD+=(--limit="${AUDIT_LOG_DELIVERY_LIMIT:-50}")
    fi
    ;;
  attachment-security-rescan)
    CMD=(bun run attachment-security:rescan --trigger=scheduled)
    if ! has_arg_prefix "--limit="; then
      CMD+=(--limit="${ATTACHMENT_SECURITY_RESCAN_LIMIT:-50}")
    fi
    ;;
  semantic-index-jobs)
    CMD=(bun run semantic:index-jobs --trigger=scheduled)
    if ! has_arg_prefix "--limit="; then
      CMD+=(--limit="${SEARCH_INDEX_JOB_LIMIT:-50}")
    fi
    ;;
  semantic-reindex)
    CMD=(bun run semantic:reindex --trigger=scheduled)
    ;;
  *)
    echo "unknown job: $JOB_NAME" >&2
    exit 64
    ;;
esac

cd "$ROOT_DIR"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
elif [[ "${JPAD_ALLOW_MISSING_ENV_FILE:-0}" != "1" ]]; then
  echo "env file not found: $ENV_FILE" >&2
  exit 66
fi

echo "[$(date -Iseconds)] starting scheduled job: $JOB_NAME"
"${CMD[@]}" "${EXTRA_ARGS[@]}"
echo "[$(date -Iseconds)] completed scheduled job: $JOB_NAME"
