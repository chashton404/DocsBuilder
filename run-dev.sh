#!/usr/bin/env bash

# This script starts your backend and frontend at the same time.
# It finds both folders, starts each server in the background,
# shows the local URLs, and stops both servers when you press Ctrl+C.
#
# How to run:
# 1) Open a terminal in this project folder.
# 2) Run: ./run-dev.sh
# 3) Open http://localhost:5173 in your browser.
# 4) Press Ctrl+C in the terminal to stop both servers.
#
# These options make the script safer:
# -e: stop if any command fails
# -u: stop if a variable is missing
# pipefail: fail a pipeline if any step fails
set -euo pipefail

# Get the folder where this script file lives.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Build the full path to the frontend folder.
FRONTEND_DIR="$ROOT_DIR/frontend"
# Build the full path to the backend folder.
BACKEND_DIR="$ROOT_DIR/backend"

# Make sure both folders exist before trying to run anything.
if [[ ! -d "$FRONTEND_DIR" || ! -d "$BACKEND_DIR" ]]; then
  # Tell the user what is missing.
  echo "Error: expected frontend/ and backend/ directories next to this script."
  # Exit now because we cannot continue.
  exit 1
fi

# If a project Python exists in backend/.venv, use it.
if [[ -x "$BACKEND_DIR/.venv/bin/python" ]]; then
  # Save that Python path in a variable.
  BACKEND_PYTHON="$BACKEND_DIR/.venv/bin/python"
else
  # Otherwise, use the system python3 command.
  BACKEND_PYTHON="python3"
fi

# This function stops both servers when the script ends.
cleanup() {
  # If the backend process ID exists and is still running...
  if [[ -n "${BACKEND_PID:-}" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    # ...ask it to stop (ignore errors while shutting down).
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
  # If the frontend process ID exists and is still running...
  if [[ -n "${FRONTEND_PID:-}" ]] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    # ...ask it to stop (ignore errors while shutting down).
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
}

# Run cleanup if script exits normally or you interrupt it (Ctrl+C).
trap cleanup EXIT INT TERM

# Start the backend in the background.
(
  # Go into the backend folder first.
  cd "$BACKEND_DIR"
  # Start the Python app file.
  "$BACKEND_PYTHON" app.py
) &
# Save the backend process ID so we can stop it later.
BACKEND_PID=$!

# Start the frontend dev server in the background.
(
  # Go into the frontend folder first.
  cd "$FRONTEND_DIR"
  # Run the frontend dev command from package.json.
  npm run dev
) &
# Save the frontend process ID so we can stop it later.
FRONTEND_PID=$!

# Print where each server will be available in the browser.
echo "Backend running on http://localhost:5000"
echo "Frontend running on http://localhost:5173"
echo "Press Ctrl+C to stop both."

# Keep this script running until one server stops.
wait -n "$BACKEND_PID" "$FRONTEND_PID"
