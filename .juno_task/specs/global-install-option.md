# Global/System-Level Dependency Installation Option

> Spec ID: `global-install-option`
> Priority: P1
> Status: Draft
> Created: 2026-02-08

## Problem Statement

When dev-browser-skill is used across multiple projects, each project copy requires its own `node_modules/` directory (~80MB npm packages + ~200MB Playwright Chromium). For a team using dev-browser in 5 projects, that's 5× redundant `npm ci` runs and 5× disk usage for identical dependencies. The Playwright Chromium binary is already shared at `~/.cache/ms-playwright/`, but npm packages are not — they must be installed locally in each `skills/dev-browser/node_modules/`.

## Current State

### How Installation Works Today
1. **Local-only `node_modules/`** — Each `skills/dev-browser/` copy has its own `node_modules/` installed by `npm ci` from `package-lock.json`
2. **Auto-install** — `server.sh` checks for `node_modules/` existence; if missing, runs `npm ci --silent` automatically
3. **`--install` flag** — Explicit install: runs `npm ci` + creates `tmp/` and `profiles/` + installs Playwright Chromium
4. **Playwright cache** — Chromium binary already shared globally at `~/.cache/ms-playwright/` (not duplicated per project)
5. **No npm workspaces** — Each package (`skills/dev-browser/`, `extension/`, root) is fully independent with its own `package-lock.json`

### Pain Points
- **Disk waste**: 80MB node_modules × N projects = significant disk usage
- **Install time**: `npm ci` runs take 10-30s per project, multiplied across projects
- **Offline fragility**: If `node_modules/` is accidentally deleted or not committed, every project needs internet access to reinstall
- **CI/CD overhead**: Docker builds must install deps for every project copy

### Dependency Analysis

**Runtime dependencies** (needed to run the server):
| Package | Size | Role |
|---------|------|------|
| `playwright` | ~40MB | Browser automation engine (binary cached separately) |
| `express` | ~1MB | HTTP server for API endpoints |
| `hono` | ~1MB | WebSocket relay server framework |
| `@hono/node-server` | <1MB | Node adapter for Hono |
| `@hono/node-ws` | <1MB | WebSocket adapter for Hono |

**Dev dependencies** (needed for tests/development, NOT for running):
| Package | Size | Role |
|---------|------|------|
| `tsx` | ~15MB | TypeScript execution (required to run `.ts` files) |
| `typescript` | ~10MB | TypeScript compiler |
| `vitest` | ~10MB | Test framework |
| `@types/express` | <1MB | TypeScript type definitions |

**Note**: `tsx` is listed as a devDependency but is actually required at runtime because `start-server.ts` is run via `npx tsx scripts/start-server.ts`.

## Requirements

### R1: Global Installation Mode (`--install --global`)

Add a `--global` modifier to the `--install` flag that installs dependencies to a shared system-level location instead of the local `node_modules/`.

```bash
# Install globally (shared across all projects)
./server.sh --install --global

# Install locally (current behavior, default)
./server.sh --install
```

**Global install directory**: `~/.dev-browser-skill/global-deps/`
- Contains the full `node_modules/` tree
- Contains a copy of `package.json` and `package-lock.json` for version tracking
- Single source of truth for npm packages across all project copies

### R2: Runtime Resolution — Global vs Local

When the server starts, it should resolve dependencies in this priority order:
1. **Local `node_modules/`** — If present, always use (backward compatible)
2. **Global `~/.dev-browser-skill/global-deps/node_modules/`** — If local not present, check global
3. **Auto-install prompt** — If neither exists, fall back to local `npm ci` (current behavior)

**Implementation**: Use Node.js `NODE_PATH` environment variable to add the global deps directory to the module resolution chain. This is the standard Node.js mechanism for extending module search paths without symlinks or hacks.

```bash
# Equivalent to:
NODE_PATH=~/.dev-browser-skill/global-deps/node_modules npx tsx scripts/start-server.ts
```

### R3: Version Coherence

The global deps must match the version expected by the local `package-lock.json`. On startup:
1. Read `~/.dev-browser-skill/global-deps/package-lock.json` lockfileVersion and packages hash
2. Compare with local `skills/dev-browser/package-lock.json`
3. If mismatch → warn user: `"Global deps out of date. Run: ./server.sh --install --global"`
4. If match → proceed with global deps

**Version tracking file**: `~/.dev-browser-skill/global-deps/.lockfile-hash` containing a SHA-256 hash of the local `package-lock.json` at install time. On startup, compare hashes for fast coherence check.

### R4: Environment Variable Override

```bash
# Force global deps (skip local node_modules check)
DEV_BROWSER_GLOBAL_DEPS=true ./server.sh

# Custom global deps path
DEV_BROWSER_GLOBAL_DEPS_PATH=/opt/dev-browser/deps ./server.sh
```

### R5: CLI Integration

Update `--help` text to document the new flag and env vars:

```
OPTIONS:
  --install               Install dependencies locally and exit
  --install --global      Install dependencies to shared system location and exit

ENVIRONMENT VARIABLES:
  DEV_BROWSER_GLOBAL_DEPS=true         Use global deps (skip local node_modules)
  DEV_BROWSER_GLOBAL_DEPS_PATH=<path>  Custom path for global deps directory
```

### R6: server.sh Integration

Update `server.sh` to:
1. Check for local `node_modules/` first (current behavior)
2. If missing, check for global deps at `~/.dev-browser-skill/global-deps/node_modules/`
3. If global deps found, set `NODE_PATH` and skip `npm ci`
4. If neither found, auto-install locally (current behavior)

```bash
# In server.sh, before running the server:
GLOBAL_DEPS="$HOME/.dev-browser-skill/global-deps/node_modules"
if [ ! -d "$SCRIPT_DIR/node_modules" ] && [ -d "$GLOBAL_DEPS" ]; then
  export NODE_PATH="$GLOBAL_DEPS"
  echo "Using global dependencies from $GLOBAL_DEPS"
else
  # Existing local install logic
fi
```

### R7: Uninstall / Cleanup

```bash
# Remove global deps
./server.sh --install --global --clean

# Or manually:
rm -rf ~/.dev-browser-skill/global-deps/
```

## Architecture Decision: Why NODE_PATH Over Alternatives

| Approach | Pros | Cons |
|----------|------|------|
| **NODE_PATH (chosen)** | Standard Node.js mechanism; no symlinks; no package.json changes; works with tsx/vitest; clean fallback to local | Must be set before process starts; slightly unconventional |
| **npm link / symlinks** | Familiar npm pattern | Fragile; breaks on node_modules delete; doesn't work well with `npm ci` |
| **npm workspaces** | Official npm feature | Requires restructuring monorepo; all projects must share root; overkill |
| **pnpm global store** | Deduplication built-in | Requires switching package managers; breaks `npm ci` |
| **Docker volume mount** | Zero host disk | Only works in Docker; doesn't help local dev |
| **Bundled distribution** | No install needed | Large zip files; hard to update; version management nightmare |

## Success Criteria

- [ ] `./server.sh --install --global` installs deps to `~/.dev-browser-skill/global-deps/`
- [ ] `./server.sh` with no local `node_modules/` uses global deps if available
- [ ] `./server.sh` with local `node_modules/` ignores global deps (backward compat)
- [ ] Version mismatch between local lock and global deps produces a warning
- [ ] `DEV_BROWSER_GLOBAL_DEPS=true` forces global deps usage
- [ ] All existing tests pass without modification
- [ ] `--help` text documents new options
- [ ] Works on macOS and Linux (the two supported platforms)

## Test Scenarios

1. `--install --global` → installs to `~/.dev-browser-skill/global-deps/`, exits 0
2. No local `node_modules/`, global deps exist → uses global deps, server starts
3. No local `node_modules/`, no global deps → auto-installs locally (current behavior)
4. Local `node_modules/` exists, global deps exist → uses local (backward compat)
5. Global deps exist but version mismatch → warns user, still uses global deps
6. `DEV_BROWSER_GLOBAL_DEPS=true` + local `node_modules/` exists → uses global deps
7. `DEV_BROWSER_GLOBAL_DEPS_PATH=/custom/path` → uses custom path
8. `--install --global --clean` → removes global deps directory
9. Two projects with identical `package-lock.json` → share global deps seamlessly
10. Upgrade scenario: update `package-lock.json` in one project → `--install --global` updates shared deps → all projects get update

## Implementation Notes

- **Phase 1**: `--install --global` flag + `NODE_PATH` resolution in `server.sh` and `start-server.ts`
- **Phase 2**: Version coherence check (lockfile hash comparison)
- **Phase 3**: `DEV_BROWSER_GLOBAL_DEPS` env var + custom path support
- The global deps directory structure mirrors a standard npm project:
  ```
  ~/.dev-browser-skill/global-deps/
  ├── package.json        (copied from skills/dev-browser/)
  ├── package-lock.json   (copied from skills/dev-browser/)
  ├── .lockfile-hash      (SHA-256 of package-lock.json)
  └── node_modules/       (installed via npm ci)
  ```
- `tsx` must be available globally OR included in global deps (it's needed to run `.ts` scripts)
- Playwright Chromium binary is already global at `~/.cache/ms-playwright/` — no changes needed for that
- Consider: should extension deps (`extension/node_modules/`) also support global install? Probably not initially — extension is only needed for development, not runtime use
