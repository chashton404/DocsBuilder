#!/usr/bin/env bash

# =============================================================================
# Development launcher — starts Flask (backend) and Vite (frontend) together.
# =============================================================================
#
# What it does:
#   • Finds this repo's frontend/ and backend/ folders next to this script.
#   • Uses backend/.venv/bin/python when present; otherwise python3.
#   • Runs backend/app.py on port 5000 and `npm run dev` (Vite) on port 5173.
#   • Registers a trap so Ctrl+C stops both processes cleanly.
#
# Typical workflow:
#   1. From the repo root: ./run-dev.sh
#   2. Open http://localhost:5173 — the UI proxies API calls to :5000.
#   3. Press Ctrl+C in this terminal to exit both servers.
#
# Bash safety flags:
#   -e — exit on first failing command
#   -u — error on unset variables
#   -o pipefail — pipeline fails if any stage fails
set -euo pipefail

# -----------------------------------------------------------------------------
# Paths (script lives at repo root next to frontend/ and backend/)
# -----------------------------------------------------------------------------
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_DIR="$ROOT_DIR/backend"

if [[ ! -d "$FRONTEND_DIR" || ! -d "$BACKEND_DIR" ]]; then
  echo "Error: expected frontend/ and backend/ directories next to this script."
  exit 1
fi

# Prefer project virtualenv when developers create backend/.venv
if [[ -x "$BACKEND_DIR/.venv/bin/python" ]]; then
  BACKEND_PYTHON="$BACKEND_DIR/.venv/bin/python"
else
  BACKEND_PYTHON="python3"
fi

# -----------------------------------------------------------------------------
# Shutdown helper — kills both background jobs when the shell exits or on SIGINT
# -----------------------------------------------------------------------------
cleanup() {
  if [[ -n "${BACKEND_PID:-}" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
  if [[ -n "${FRONTEND_PID:-}" ]] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

# -----------------------------------------------------------------------------
# Start backend (Flask) — subshell cds so imports resolve relative to backend/
# -----------------------------------------------------------------------------
(
  cd "$BACKEND_DIR"
  "$BACKEND_PYTHON" app.py
) &
BACKEND_PID=$!

# -----------------------------------------------------------------------------
# Start frontend (Vite dev server with hot reload)
# -----------------------------------------------------------------------------
(
  cd "$FRONTEND_DIR"
  npm run dev
) &
FRONTEND_PID=$!

echo "Backend running on http://localhost:5000"
echo "Frontend running on http://localhost:5173"
echo "Press Ctrl+C to stop both."

# Block until either child exits (error or manual kill propagates here)
wait -n "$BACKEND_PID" "$FRONTEND_PID"
