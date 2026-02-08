# Dev-Browser-Skill Extension Plan

> Last updated: 2026-02-08 (added global install option spec)

## Project Overview

**dev-browser-skill** is a browser automation framework for Claude Code (and other AI agents) with two modes:
1. **Launch Mode** — Starts a headless/headful Chromium via Playwright, exposes HTTP + CDP APIs on port 9222/9223
2. **Extension Mode** — Chrome extension bridges a relay server to user's real Chrome browser, forwarding CDP commands

The project currently provides: page management (create/list/close), ARIA accessibility snapshots, element ref selection, screenshot capture, and API-based web scraping.

## Priority Plan — Items to Implement

### P0 — Critical / Foundation

- [ ] **Multi-Browser Profile Support** — Allow launching multiple isolated browser contexts for parallel test execution (currently only one persistent context)
  - Spec: `.juno_task/specs/multi-profile-vibes.md`

- [ ] **Authentication & Security for Relay** — Add token-based auth to the WebSocket relay so arbitrary localhost clients can't hijack browser sessions
  - Spec: `.juno_task/specs/relay-lockdown.md`

- [ ] **Comprehensive Test Coverage** — Extension tests exist but server (`index.ts`), relay (`relay.ts`), and client (`client.ts`) have zero unit tests
  - Spec: `.juno_task/specs/test-coverage-arc.md`

### P1 — High Priority / Core Features

- [x] **CLI Help Command & --help Argument** — Add `--help`/`-h` flag with usage text, proper arg parsing replacing env-var-only config, error messages for unknown flags _(Done: commit 1ae4348, tag 0.0.1)_
  - Spec: `.juno_task/specs/cli-help-command.md`

- [x] **Default Headless Mode** — Flip default from headful to headless; add `--headful` opt-in flag; print active mode at startup _(Done: commit 9ab570b, tag 0.0.2)_
  - Spec: `.juno_task/specs/default-headless-mode.md`

- [x] **Cookie Injection at Startup** — Allow users to set cookies via `--cookies` flag in key-value, JSON, or Netscape text file format; domain required for key-value/JSON _(Done: commit c9619e7, tag 0.0.3)_
  - Spec: `.juno_task/specs/cookie-injection.md`

- [x] **Server Status & Instance Discovery** — `--status` flag to list running instances; label instances by PWD; PID file registry in `~/.dev-browser-skill/instances/` _(Done: commit 458f8e6, tag 0.0.4)_
  - Spec: `.juno_task/specs/server-status-discovery.md`

- [x] **Multi-Instance Port Management & Profile Locking** — Port auto-selection (9222→9224→9226...), profile dir locking via .dev-browser.lock, stale lock cleanup _(Done: commit 729af8d, tag 0.0.5)_
  - Spec: `.juno_task/specs/multi-instance-lifecycle.md`

- [x] **Browser Cleanup & --stop/--stop-all Commands** — Chrome PID tracking, orphan cleanup, `--stop`/`--stop-all` commands _(Done: commit 1eca165, tag 0.0.6)_
  - Spec: `.juno_task/specs/multi-instance-lifecycle.md`

- [ ] **Configurable Relay URL & Port** — Replace hardcoded `ws://localhost:9222/extension` with user-configurable settings (env vars, extension options page)
  - Spec: `.juno_task/specs/config-drip.md`

- [ ] **Iframe & Cross-Origin Snapshot Support** — ARIA snapshots currently only cover the main document; extend to recursively snapshot accessible iframes
  - Spec: `.juno_task/specs/iframe-snapshot-slay.md`

- [ ] **Command Timeout & Retry Logic** — CDP commands to tabs can hang indefinitely; add configurable timeouts and retry with backoff
  - Spec: `.juno_task/specs/timeout-bounce.md`

- [ ] **Network Request Interception API** — Expose a first-class API for intercepting/modifying network requests, beyond the current scraping guide
  - Spec: `.juno_task/specs/net-intercept-drip.md`

- [ ] **Global/System-Level Dependency Installation** — Allow `--install --global` to install deps to `~/.dev-browser-skill/global-deps/` so multiple projects share one `node_modules/` instead of duplicating ~80MB per project
  - Spec: `.juno_task/specs/global-install-option.md`

### P2 — Medium Priority / DX Improvements

- [ ] **Session Persistence & Recovery** — Save session state (open pages, refs, cookies) so automation can resume after relay/browser restart
  - Spec: `.juno_task/specs/session-persist-era.md`

- [ ] **Streaming / Incremental ARIA Snapshots** — For large DOMs, stream snapshot generation instead of full regeneration each call
  - Spec: `.juno_task/specs/snapshot-stream-core.md`

- [ ] **Multi-Client Namespace Isolation** — When multiple Playwright clients connect to the relay, isolate their page names and session IDs
  - Spec: `.juno_task/specs/namespace-iso-fit.md`

- [ ] **Extension Options Page** — Add a proper Chrome extension options page for configuring relay URL, auth token, logging level
  - Spec: `.juno_task/specs/extension-options-glow.md`

### P3 — Lower Priority / Nice to Have

- [ ] **Firefox & WebKit Support** — Currently Chromium-only; extend to Firefox via WXT and WebKit via Playwright
  - Spec: `.juno_task/specs/multi-browser-flex.md`

- [ ] **Visual Element Highlighting** — When selecting a snapshot ref, highlight the element in the browser for visual debugging
  - Spec: `.juno_task/specs/highlight-pop.md`

- [ ] **Performance Profiling Integration** — Expose Chrome Performance/HeapProfiler CDP domains through the relay
  - Spec: `.juno_task/specs/perf-profiler-grind.md`

- [ ] **Snapshot Diff & Comparison** — Compare two snapshots to detect DOM changes between automation steps
  - Spec: `.juno_task/specs/snapshot-diff-check.md`

## Completed Items
- **Fix server.sh --help deps + rename --install-requirements to --install** (sip5c9) — commit c90b226, tag 0.0.12
- **npm ci & Auto-Install Dependencies** (kT5JR5) — commit fe61991, tag 0.0.13
- **ENV Variable Controls & --install-requirements & Log Path Override** (6PaTMk, fj0GD3, TdGL0v) — commit 1a893e6, tag 0.0.11
- **Upstream Reference Update** (WBq5xg) — commit 510c105, tag 0.0.10
- **Docker Prerequisites Documentation** (Y3ulHA) — commit 0657bae, tag 0.0.9
- **ChromePid Crash Fix** (6uEY5Y) — commit 72a1b4f, tag 0.0.8
- **SKILL.md & README.md Documentation Update** (QD2UVG) — commit a0fb56e, tag 0.0.7
- **Browser Cleanup & --stop/--stop-all Commands** (8XvmeA) — commit 1eca165, tag 0.0.6
- **Multi-Instance Port Management & Profile Locking** (V1QSft) — commit 729af8d, tag 0.0.5
- **Server Status & Instance Discovery** (7R1njQ) — commit 458f8e6, tag 0.0.4
- **Cookie Injection at Startup** (a5wn55) — commit c9619e7, tag 0.0.3
- **CLI Argument Parser & Help Command** (Ll8Eno) — commit 1ae4348, tag 0.0.1
- **Default Headless Mode & --headful Flag** (Bw6BbR) — commit 9ab570b, tag 0.0.2

## Architecture Reference

See `.juno_task/specs/architecture.md` for full system architecture.
See `skills/dev-browser/SKILL.md` for usage documentation.
