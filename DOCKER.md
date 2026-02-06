# Docker Prerequisites for dev-browser-skill

## System Requirements

| Requirement  | Minimum                   | Recommended   |
| ------------ | ------------------------- | ------------- |
| Node.js      | 18.x                      | 20.x+         |
| npm          | 8.x                       | 10.x+         |
| Architecture | x64, arm64                | —             |
| OS           | Debian 11+, Ubuntu 20.04+ | Ubuntu 22.04+ |

## Base Image

```dockerfile
FROM node:20-bookworm-slim
```

`node:20-bookworm-slim` (Debian 12) is recommended. It includes Node.js 20 and npm, keeping the image small while providing glibc compatibility for Playwright browsers.

## APT Packages

### Required — Playwright Chromium Dependencies

These are the native libraries Chromium needs to run (headless or headful):

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Chromium runtime dependencies
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    # Font rendering (required for screenshots/snapshots)
    fonts-liberation \
    fonts-noto-color-emoji \
    fonts-freefont-ttf \
    libfontconfig1 \
    libfreetype6 \
    # Xvfb for headful mode in containers (optional if only using headless)
    xvfb \
    && rm -rf /var/lib/apt/lists/*
```

> **Note for Ubuntu 24.04**: Several package names have a `t64` suffix (e.g., `libasound2t64`, `libcups2t64`). Use the packages matching your base distro.

### Optional — CJK & Extended Font Support

Only needed if browsing sites with Chinese, Japanese, Korean, or Thai text:

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-tlwg-loma-otf \
    fonts-unifont \
    xfonts-cyrillic \
    xfonts-scalable \
    && rm -rf /var/lib/apt/lists/*
```

## npm Packages (installed via `npm install`)

### Skill Server (`skills/dev-browser/`)

| Package                                 | Purpose                                       |
| --------------------------------------- | --------------------------------------------- |
| `playwright` (^1.49.0)                  | Browser automation + Chromium binary download |
| `express` (^4.21.0)                     | HTTP API server                               |
| `hono` (^4.11.1)                        | WebSocket relay server (extension mode)       |
| `@hono/node-server` (^1.19.7)           | Hono Node.js adapter                          |
| `@hono/node-ws` (^1.2.0)                | Hono WebSocket adapter                        |
| `tsx` (^4.21.0)                         | TypeScript execution (dev)                    |
| `vitest` (^2.1.0)                       | Test runner (dev)                             |
| `typescript` (^5.0.0)                   | Type checking (dev)                           |
| `@rollup/rollup-linux-x64-gnu` (^4.0.0) | Optional, Rollup native binding for Linux x64 |

### Extension (`extension/`) — development only

| Package                   | Purpose                    |
| ------------------------- | -------------------------- |
| `wxt` (^0.20.0)           | Chrome extension framework |
| `vitest` (^3.0.0)         | Test runner                |
| `typescript` (^5.0.0)     | Type checking              |
| `@types/chrome` (^0.1.32) | Chrome extension API types |

### Root (formatting/linting)

| Package                 | Purpose              |
| ----------------------- | -------------------- |
| `prettier` (^3.7.4)     | Code formatter       |
| `husky` (^9.1.7)        | Git hooks            |
| `lint-staged` (^16.2.7) | Staged files linting |
| `typescript` (^5)       | Type checking        |

## Playwright Browser Installation

After `npm install`, Playwright's Chromium must be downloaded:

```dockerfile
# Install only Chromium (saves ~500MB over installing all browsers)
RUN cd skills/dev-browser && npx playwright install chromium

# OR install Chromium + its OS dependencies in one command
RUN cd skills/dev-browser && npx playwright install --with-deps chromium
```

The `--with-deps` flag runs `apt-get install` for all required system libraries automatically, so you can skip the manual APT package list above if preferred. However, pre-installing APT packages in an earlier Docker layer gives better caching.

## Complete Dockerfile Example

```dockerfile
FROM node:20-bookworm-slim

# System dependencies for Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    fonts-liberation \
    fonts-noto-color-emoji \
    fonts-freefont-ttf \
    libfontconfig1 \
    libfreetype6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json* ./
COPY skills/dev-browser/package.json skills/dev-browser/
COPY extension/package.json extension/

# Install root + skill dependencies
RUN npm install --ignore-scripts
RUN cd skills/dev-browser && npm install

# Download Chromium
RUN cd skills/dev-browser && npx playwright install chromium

# Copy source
COPY . .

# Default port
EXPOSE 9222

# Start the server in headless mode (default)
CMD ["npx", "tsx", "skills/dev-browser/scripts/start-server.ts"]
```

## Environment Variables

| Variable   | Default   | Description                                   |
| ---------- | --------- | --------------------------------------------- |
| `PORT`     | `9222`    | HTTP API port                                 |
| `HOST`     | `0.0.0.0` | Bind address                                  |
| `HEADLESS` | `true`    | `false` for headful (requires Xvfb in Docker) |

## Running Headful in Docker

If you need a visible browser (e.g., for debugging with VNC):

```bash
# Start with Xvfb wrapper
xvfb-run --auto-servernum --server-args="-screen 0 1920x1080x24" \
  npx tsx skills/dev-browser/scripts/start-server.ts --headful
```

## Quick Verification

```bash
# After container starts, verify the server is healthy
curl http://localhost:9222/
```
