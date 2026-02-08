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

# Resolve global deps directory (env override or default)
GLOBAL_DEPS_DIR="${DEV_BROWSER_GLOBAL_DEPS_PATH:-$HOME/.dev-browser-skill/global-deps}"
GLOBAL_DEPS="$GLOBAL_DEPS_DIR/node_modules"

if [ "$SKIP_INSTALL" = false ]; then
  if [ "$DEV_BROWSER_GLOBAL_DEPS" = "true" ] && [ -d "$GLOBAL_DEPS" ]; then
    # Force global deps via env var
    export NODE_PATH="$GLOBAL_DEPS${NODE_PATH:+:$NODE_PATH}"
    echo "Using global dependencies from $GLOBAL_DEPS"
  elif [ ! -d "$SCRIPT_DIR/node_modules" ] && [ -d "$GLOBAL_DEPS" ]; then
    # No local node_modules, but global deps available
    export NODE_PATH="$GLOBAL_DEPS${NODE_PATH:+:$NODE_PATH}"
    echo "Using global dependencies from $GLOBAL_DEPS"
  elif [ ! -d "$SCRIPT_DIR/node_modules" ]; then
    # No local or global deps — auto-install locally
    echo "Dependencies not found. Installing with npm ci..."
    npm ci --silent
  fi
fi

npx tsx scripts/start-server.ts "$@"
