#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

docker compose up -d clamav

for attempt in $(seq 1 60); do
  if UPLOAD_MALWARE_SCAN_MODE=required \
    UPLOAD_DLP_SCAN_MODE=off \
    UPLOAD_CLAMAV_HOST=127.0.0.1 \
    UPLOAD_CLAMAV_PORT=3310 \
    UPLOAD_ENABLE_BUILTIN_EICAR=0 \
    bun run tests/smoke/upload-security-clamav.test.ts >/tmp/jpad-clamav-smoke.log 2>&1; then
    cat /tmp/jpad-clamav-smoke.log
    exit 0
  fi

  sleep 5
done

cat /tmp/jpad-clamav-smoke.log || true
echo "ClamAV smoke did not become ready in time" >&2
exit 1
