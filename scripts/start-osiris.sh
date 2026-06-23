#!/usr/bin/env bash
#
# start-osiris.sh — launch OSIRIS dashboard + scanner sidecar together.
#
# The dashboard (:3000) proxies all RECON toolkit features through
# /api/scanner to the scanner sidecar (:7700). Without the sidecar,
# every recon scan returns "502 Scanner unreachable", so both must run.
#
# Usage:  ./scripts/start-osiris.sh
#         npm run osiris
#
set -euo pipefail

DASH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCANNER_DIR="$(cd "$DASH_DIR/../osiris-scanner" && pwd)"
SCANNER_PORT="${SCANNER_PORT:-7700}"

if [ ! -f "$SCANNER_DIR/server.js" ]; then
  echo "✗ Scanner not found at $SCANNER_DIR (expected sibling 'osiris-scanner' folder)" >&2
  exit 1
fi
if [ ! -f "$SCANNER_DIR/.scanner_key" ]; then
  echo "✗ $SCANNER_DIR/.scanner_key missing — scanner auth will fail" >&2
  exit 1
fi

# Track child PIDs so a single Ctrl-C tears both down cleanly.
pids=()
cleanup() {
  echo
  echo "→ Shutting down OSIRIS..."
  for pid in "${pids[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

# 1. Scanner sidecar
if lsof -nP -iTCP:"$SCANNER_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "✓ Scanner already listening on :$SCANNER_PORT — reusing it"
else
  echo "→ Starting scanner sidecar on :$SCANNER_PORT"
  ( cd "$SCANNER_DIR" && PORT="$SCANNER_PORT" node server.js ) &
  pids+=($!)
fi

# 2. Dashboard (foreground-ish; runs until Ctrl-C)
echo "→ Starting dashboard on :3000"
( cd "$DASH_DIR" && npm run dev ) &
pids+=($!)

echo "✓ OSIRIS up — dashboard http://localhost:3000  |  scanner http://localhost:$SCANNER_PORT"
echo "  Press Ctrl-C to stop both."
wait
