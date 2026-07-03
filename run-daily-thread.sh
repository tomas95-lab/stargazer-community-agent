#!/bin/bash
# Wrapper for local schedulers such as launchd or cron.
# Scheduler processes often skip your shell profile, so PATH is set explicitly.

set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "$0")" && pwd)}"
LOG_DIR="$PROJECT_DIR/logs"
mkdir -p "$LOG_DIR"

# Common Node install locations (Homebrew Intel/ARM, system, nvm default).
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$HOME/.nvm/current/bin:$PATH"

# If you use nvm, uncomment the next two lines so this script can find node:
# export NVM_DIR="$HOME/.nvm"
# [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

cd "$PROJECT_DIR"

TIMESTAMP="$(date '+%Y-%m-%d_%H-%M-%S')"
LOG_FILE="$LOG_DIR/run-$TIMESTAMP.log"

{
  echo "=== Run started: $(date) ==="
  echo "node: $(command -v node || echo NOT FOUND)"
  echo "npm:  $(command -v npm || echo NOT FOUND)"
  npm run daily -- --publish --yes
  echo "=== Run finished: $(date) ==="
} >> "$LOG_FILE" 2>&1
