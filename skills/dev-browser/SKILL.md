---
name: dev-browser
description: Browser automation with persistent page state. Use when users ask to navigate websites, fill forms, take screenshots, extract web data, test web apps, or automate browser workflows. Trigger phrases include "go to [url]", "click on", "fill out the form", "take a screenshot", "scrape", "automate", "test the website", "log into", or any browser interaction request.
argument-hint: [Task] [Cookies path .txt json or key value]
---

# Dev Browser Skill

Browser automation that maintains page state across script executions. Write small, focused scripts to accomplish tasks incrementally. Once you've proven out part of a workflow and there is repeated work to be done, you can write a script to do the repeated work in a single execution.

## Choosing Your Approach

- **Local/source-available sites**: Read the source code first to write selectors directly
- **Unknown page layouts**: Use `getAISnapshot()` to discover elements and `selectSnapshotRef()` to interact with them
- **Visual feedback**: Take screenshots to see what the user sees

## Setup

Run `./skills/dev-browser/server.sh --help` to see what is available.

Two modes available. Ask the user if unclear which to use.

### Standalone Mode (Default)

Launches a new Chromium browser in headless mode (no visible window) for fresh automation sessions.

```bash
./skills/dev-browser/server.sh &
```

Add `--headful` flag if user needs a visible browser window. **Wait for the `Ready` message before running scripts.**

#### CLI Flags

| Flag                     | Description                                             |
| ------------------------ | ------------------------------------------------------- |
| `--help`, `-h`           | Show help message and exit                              |
| `--headless`             | Run in headless mode (default)                          |
| `--headful`              | Run with visible browser window                         |
| `--port <number>`        | HTTP API port (default: 9222, auto-selects if occupied) |
| `--cdp-port <number>`    | Chrome DevTools Protocol port (default: port+1)         |
| `--profile-dir <path>`   | Custom browser profile directory                        |
| `--label <name>`         | Label this instance (default: current directory)        |
| `--cookies <source>`     | Load cookies at startup (repeatable, see below)         |
| `--status`               | Show all running instances and exit                     |
| `--stop <port>`          | Stop instance on given port                             |
| `--stop-all`             | Stop all running instances                              |
| `--install`              | Install Playwright browsers and dependencies, then exit |

Configuration priority: CLI flags > environment variables > defaults.

#### Environment Variables

| Variable                      | Effect                                                               |
| ----------------------------- | -------------------------------------------------------------------- |
| `DEV_BROWSER_DISABLE_HEADFUL` | Set `true` to force headless (ignores `--headful`)                   |
| `DEV_BROWSER_LOG_PATH`        | Redirect log output to a file (also prints to stdout)                |
| `PORT`                        | Default HTTP port (overridden by `--port`)                           |
| `HEADLESS`                    | Default mode `true`/`false` (overridden by `--headful`/`--headless`) |

#### Pre-loading Cookies

Use `--cookies` to inject cookies before any pages open. Useful for auth tokens and session cookies.

**Key-value format:**

```bash
./skills/dev-browser/server.sh --cookies 'name=session;value=abc123;domain=.example.com' &
```

Optional fields: `path`, `expires` (Unix timestamp), `secure`, `httpOnly`, `sameSite` (Strict/Lax/None).

**JSON format** (single object or array):

```bash
./skills/dev-browser/server.sh --cookies '{"name":"token","value":"xyz","domain":".api.com"}' &
```

**File reference** (JSON or Netscape/cURL format):

```bash
./skills/dev-browser/server.sh --cookies @cookies.json &
./skills/dev-browser/server.sh --cookies @cookies.txt &
```

Multiple `--cookies` flags merge. Duplicate name+domain pairs: last wins.

#### Multi-Instance Support

Multiple servers can run simultaneously. Port auto-selects if 9222 is occupied (tries 9224, 9226, etc.). Each instance locks its profile directory to prevent corruption.

```bash
# Check running instances
./skills/dev-browser/server.sh --status

# Stop a specific instance
./skills/dev-browser/server.sh --stop 9222

# Stop all instances
./skills/dev-browser/server.sh --stop-all
```

When connecting to a non-default port:

```typescript
const client = await connect("http://localhost:9224");
```

### Extension Mode

Connects to user's existing Chrome browser. Use this when:

- The user is already logged into sites and wants you to do things behind an authed experience that isn't local dev.
- The user asks you to use the extension

**Important**: The core flow is still the same. You create named pages inside of their browser.

**Start the relay server:**

```bash
cd skills/dev-browser && npm i && npm run start-extension &
```

Wait for `Waiting for extension to connect...` followed by `Extension connected` in the console. To know that a client has connected and the browser is ready to be controlled.
**Workflow:**

1. Scripts call `client.page("name")` just like the normal mode to create new pages / connect to existing ones.
2. Automation runs on the user's actual browser session

If the extension hasn't connected yet, tell the user to launch and activate it. Download link: https://github.com/askbudi/dev-browser-skill/releases

## Writing Scripts

> **Run all scripts from `skills/dev-browser/` directory.** The `@/` import alias requires this directory's config.

Execute scripts inline using heredocs:

```bash
cd skills/dev-browser && npx tsx <<'EOF'
import { connect, waitForPageLoad } from "@/client.js";

const client = await connect();
// Create page with custom viewport size (optional)
const page = await client.page("example", { viewport: { width: 1920, height: 1080 } });

await page.goto("https://example.com");
await waitForPageLoad(page);

console.log({ title: await page.title(), url: page.url() });
await client.disconnect();
EOF
```

**Write to `tmp/` files only when** the script needs reuse, is complex, or user explicitly requests it.

### Key Principles

1. **Small scripts**: Each script does ONE thing (navigate, click, fill, check)
2. **Evaluate state**: Log/return state at the end to decide next steps
3. **Descriptive page names**: Use `"checkout"`, `"login"`, not `"main"`
4. **Disconnect to exit**: `await client.disconnect()` - pages persist on server
5. **Plain JS in evaluate**: `page.evaluate()` runs in browser - no TypeScript syntax

## Workflow Loop

Follow this pattern for complex tasks:

1. **Write a script** to perform one action
2. **Run it** and observe the output
3. **Evaluate** - did it work? What's the current state?
4. **Decide** - is the task complete or do we need another script?
5. **Repeat** until task is done

### No TypeScript in Browser Context

Code passed to `page.evaluate()` runs in the browser, which doesn't understand TypeScript:

```typescript
// ✅ Correct: plain JavaScript
const text = await page.evaluate(() => {
  return document.body.innerText;
});

// ❌ Wrong: TypeScript syntax will fail at runtime
const text = await page.evaluate(() => {
  const el: HTMLElement = document.body; // Type annotation breaks in browser!
  return el.innerText;
});
```

## Scraping Data

For scraping large datasets, intercept and replay network requests rather than scrolling the DOM. See [references/scraping.md](references/scraping.md) for the complete guide covering request capture, schema discovery, and paginated API replay.

## Client API

```typescript
const client = await connect(); // default: http://localhost:9222
const client = await connect("http://localhost:9224"); // custom port

// Get or create named page (viewport only applies to new pages)
const page = await client.page("name");
const pageWithSize = await client.page("name", { viewport: { width: 1920, height: 1080 } });

const pages = await client.list(); // List all page names
await client.close("name"); // Close a page
await client.disconnect(); // Disconnect (pages persist)

// ARIA Snapshot methods
const snapshot = await client.getAISnapshot("name"); // Get accessibility tree
const element = await client.selectSnapshotRef("name", "e5"); // Get element by ref

// Server info
const info = await client.getServerInfo(); // { wsEndpoint, mode, label, pid, port, ... }
```

The `page` object is a standard Playwright Page.

## Waiting

```typescript
import { waitForPageLoad } from "@/client.js";

await waitForPageLoad(page); // After navigation
await page.waitForSelector(".results"); // For specific elements
await page.waitForURL("**/success"); // For specific URL
```

## Inspecting Page State

### Screenshots

```typescript
await page.screenshot({ path: "tmp/screenshot.png" });
await page.screenshot({ path: "tmp/full.png", fullPage: true });
```

### ARIA Snapshot (Element Discovery)

Use `getAISnapshot()` to discover page elements. Returns YAML-formatted accessibility tree:

```yaml
- banner:
  - link "Hacker News" [ref=e1]
  - navigation:
    - link "new" [ref=e2]
- main:
  - list:
    - listitem:
      - link "Article Title" [ref=e8]
      - link "328 comments" [ref=e9]
- contentinfo:
  - textbox [ref=e10]
    - /placeholder: "Search"
```

**Interpreting refs:**

- `[ref=eN]` - Element reference for interaction (visible, clickable elements only)
- `[checked]`, `[disabled]`, `[expanded]` - Element states
- `[level=N]` - Heading level
- `/url:`, `/placeholder:` - Element properties

**Interacting with refs:**

```typescript
const snapshot = await client.getAISnapshot("hackernews");
console.log(snapshot); // Find the ref you need

const element = await client.selectSnapshotRef("hackernews", "e2");
await element.click();
```

## Error Recovery

Page state persists after failures. Debug with:

```bash
cd skills/dev-browser && npx tsx <<'EOF'
import { connect } from "@/client.js";

const client = await connect();
const page = await client.page("hackernews");

await page.screenshot({ path: "tmp/debug.png" });
console.log({
  url: page.url(),
  title: await page.title(),
  bodyText: await page.textContent("body").then((t) => t?.slice(0, 200)),
});

await client.disconnect();
EOF
```

---

$ARGUMENTS
