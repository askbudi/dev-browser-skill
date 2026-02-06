#!/bin/bash

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Change to the script directory
cd "$SCRIPT_DIR"

# Check if any argument is a "no-deps" command that doesn't need npm install
SKIP_INSTALL=false
for arg in "$@"; do
  case "$arg" in
    --help|-h|--status|--stop|--stop-all)
      SKIP_INSTALL=true
      break
      ;;
  esac
done

if [ "$SKIP_INSTALL" = false ]; then
  # Auto-install dependencies if node_modules is missing
  if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
    echo "Dependencies not found. Installing with npm ci..."
    npm ci --silent
  fi
fi

npx tsx scripts/start-server.ts "$@"
