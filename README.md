# dev-browser-skill

Browser automation framework for AI agents (Claude Code and others). Maintains persistent page state across script executions, provides ARIA accessibility snapshots for element discovery, and supports both standalone Chromium and Chrome extension modes.

## Features

- **Persistent pages** — Named pages survive across script executions; reconnect by name
- **ARIA snapshots** — Accessibility tree with element refs for reliable interaction without brittle selectors
- **Two modes** — Launch a fresh Chromium (standalone) or connect to user's real Chrome (extension)
- **Cookie injection** — Pre-load auth tokens via `--cookies` in key-value, JSON, or Netscape file formats
- **Multi-instance** — Run multiple servers with automatic port selection and profile locking
- **Instance management** — `--status`, `--stop`, `--stop-all` for controlling running instances
- **Headless by default** — Optimized for AI/CI workflows; opt into visible browser with `--headful`

## Quick Start

### Install

```bash
cd skills/dev-browser && npm install
```

### Start Server

```bash
# Headless (default)
./skills/dev-browser/server.sh &

# Headful (visible browser)
./skills/dev-browser/server.sh --headful &

# With cookies
./skills/dev-browser/server.sh --cookies 'name=session;value=abc;domain=.example.com' &

# Custom port
./skills/dev-browser/server.sh --port 9224 &
```

Wait for the `Ready` message before running scripts.

### Run a Script

```bash
cd skills/dev-browser && npx tsx <<'EOF'
import { connect, waitForPageLoad } from "@/client.js";

const client = await connect();
const page = await client.page("example", { viewport: { width: 1920, height: 1080 } });

await page.goto("https://example.com");
await waitForPageLoad(page);

console.log({ title: await page.title(), url: page.url() });
await client.disconnect();
EOF
```

## CLI Flags

| Flag                     | Description                                          |
| ------------------------ | ---------------------------------------------------- |
| `--help`, `-h`           | Show help and exit                                   |
| `--headless`             | Headless mode (default)                              |
| `--headful`              | Visible browser window                               |
| `--port <n>`             | HTTP API port (default: 9222, auto-selects if busy)  |
| `--cdp-port <n>`         | Chrome DevTools Protocol port (default: port+1)      |
| `--profile-dir <path>`   | Browser profile directory                            |
| `--label <name>`         | Instance label (default: cwd)                        |
| `--cookies <source>`     | Load cookies (repeatable); key-value, JSON, or @file |
| `--status`               | List running instances                               |
| `--stop <port>`          | Stop instance on port                                |
| `--stop-all`             | Stop all instances                                   |
| `--install-requirements` | Install Playwright browsers and exit (no server)     |

Priority: CLI flags > environment variables > defaults.

## Environment Variables

| Variable                      | Description                                                            |
| ----------------------------- | ---------------------------------------------------------------------- |
| `DEV_BROWSER_DISABLE_HEADFUL` | Set to `true` to force headless mode (ignores `--headful` flag)        |
| `DEV_BROWSER_LOG_PATH`        | File path to redirect all log output (logs are also printed to stdout) |
| `PORT`                        | HTTP API port (overridden by `--port` flag)                            |
| `HEADLESS`                    | Browser mode `true`/`false` (overridden by `--headful`/`--headless`)   |

## Cookie Formats

**Key-value:** `name=session;value=abc;domain=.example.com;path=/;secure;httpOnly;sameSite=Lax`

**JSON:** `{"name":"token","value":"xyz","domain":".api.com"}` or `[{...}, {...}]`

**File reference:** `@cookies.json` (JSON) or `@cookies.txt` (Netscape/cURL tab-separated format)

Multiple `--cookies` flags merge; duplicate name+domain → last wins. Domain is required for key-value and JSON formats.

## HTTP API

| Endpoint       | Method | Description                                              |
| -------------- | ------ | -------------------------------------------------------- |
| `/`            | GET    | Server info (mode, label, pid, port, uptime, page count) |
| `/pages`       | GET    | List page names                                          |
| `/pages`       | POST   | Create/get page (`{ name, viewport? }`)                  |
| `/pages/:name` | DELETE | Close and unregister page                                |

## Client API

```typescript
import { connect, waitForPageLoad } from "@/client.js";

const client = await connect(); // default port 9222
const client = await connect("http://localhost:9224"); // custom port

const page = await client.page("name"); // get or create page
const page = await client.page("name", { viewport: { width: 1920, height: 1080 } });

const pages = await client.list(); // list page names
await client.close("name"); // close page
await client.disconnect(); // disconnect (pages persist)

const snapshot = await client.getAISnapshot("name"); // ARIA accessibility tree
const element = await client.selectSnapshotRef("name", "e5"); // element by ref
const info = await client.getServerInfo(); // server metadata
```

## Extension Mode

Connect to user's existing Chrome browser for authenticated sessions.

```bash
cd skills/dev-browser && npm i && npm run start-extension &
```

Requires the [dev-browser Chrome extension](https://github.com/askbudi/dev-browser-skill/releases). The client API is identical — scripts use `client.page("name")` the same way.

## Multi-Instance Management

```bash
# Ports auto-select when default (9222) is occupied: 9224, 9226, ...
./skills/dev-browser/server.sh &      # gets 9222
./skills/dev-browser/server.sh &      # auto-selects 9224

# Check running instances
./skills/dev-browser/server.sh --status

# Stop instances
./skills/dev-browser/server.sh --stop 9222
./skills/dev-browser/server.sh --stop-all
```

Profile directories are locked to prevent concurrent access. Orphaned Chrome processes from crashes are cleaned up automatically on startup.

## Development

```bash
# Skill tests
cd skills/dev-browser && npx vitest run

# Extension tests
cd extension && npx wxt prepare && npx vitest run

# Format check
npm run format:check

# Format fix
npm run format
```

## Architecture

- `skills/dev-browser/src/index.ts` — Express HTTP server + Playwright browser management
- `skills/dev-browser/src/client.ts` — Client API with ARIA snapshot support
- `skills/dev-browser/src/cli.ts` — CLI argument parser
- `skills/dev-browser/src/cookies.ts` — Cookie injection (key-value, JSON, Netscape)
- `skills/dev-browser/src/instance-registry.ts` — Instance registry for --status/--stop
- `skills/dev-browser/src/port-selection.ts` — Port auto-selection
- `skills/dev-browser/src/profile-lock.ts` — Profile directory locking
- `skills/dev-browser/src/relay.ts` — Hono WebSocket relay server (extension mode)
- `skills/dev-browser/src/snapshot/` — ARIA accessibility tree generator
- `extension/` — Chrome extension (WXT framework)
