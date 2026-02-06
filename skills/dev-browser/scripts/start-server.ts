import { serve } from "@/index.js";
import { parseArgs, resolveConfig, printHelp } from "@/cli.js";
import {
  printStatusTable,
  stopInstance,
  stopAllInstances,
  cleanOrphanedChrome,
} from "@/instance-registry.js";
import { findAvailablePort } from "@/port-selection.js";
import { execSync } from "child_process";
import { createWriteStream, mkdirSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

/**
 * Install npm dependencies using npm ci if node_modules is missing.
 * npm ci is preferred over npm install because it:
 * - Installs exact versions from package-lock.json (deterministic)
 * - Is faster in CI/Docker environments (no resolution step)
 * - Ensures clean installs by removing existing node_modules first
 */
function ensureDependenciesInstalled(scriptDir: string): void {
  const nodeModulesDir = join(scriptDir, "node_modules");
  if (!existsSync(nodeModulesDir)) {
    console.log("Dependencies not found. Installing with npm ci...");
    execSync("npm ci", { cwd: scriptDir, stdio: "inherit" });
    console.log("Dependencies installed successfully.");
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const tmpDir = join(__dirname, "..", "tmp");

// Set up log redirection if DEV_BROWSER_LOG_PATH is set
if (process.env.DEV_BROWSER_LOG_PATH) {
  const logPath = process.env.DEV_BROWSER_LOG_PATH;
  const logDir = dirname(logPath);
  mkdirSync(logDir, { recursive: true });
  const logStream = createWriteStream(logPath, { flags: "a" });

  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);

  process.stdout.write = (chunk: any, ...rest: any[]) => {
    logStream.write(chunk);
    return originalStdoutWrite(chunk, ...rest);
  };
  process.stderr.write = (chunk: any, ...rest: any[]) => {
    logStream.write(chunk);
    return originalStderrWrite(chunk, ...rest);
  };

  // Override console methods to go through the redirected streams
  const origLog = console.log;
  const origError = console.error;
  console.log = (...args: any[]) => origLog(...args);
  console.error = (...args: any[]) => origError(...args);

  console.log(`Log output also being written to: ${logPath}`);
}

// Parse CLI arguments (skip node and script path)
const args = parseArgs(process.argv.slice(2));

// Handle --help early (no browser, no deps)
if (args.help) {
  printHelp();
  process.exit(0);
}

// Handle --status: list all running instances and exit
if (args.status) {
  printStatusTable();
  process.exit(0);
}

// Handle --stop: stop a specific instance by port
if (args.stop !== undefined) {
  const port = parseInt(args.stop, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    console.error(`Error: Invalid port "${args.stop}". Must be a number between 1 and 65535.`);
    process.exit(1);
  }
  const result = await stopInstance(port);
  console.log(result.message);
  process.exit(result.success ? 0 : 1);
}

// Handle --stop-all: stop all running instances
if (args.stopAll) {
  const results = await stopAllInstances();
  if (results.length === 0) {
    console.log("No dev-browser-skill instances to stop.");
  } else {
    for (const result of results) {
      console.log(result.message);
    }
    const allOk = results.every((r) => r.success);
    console.log(
      `\n${results.length} instance(s) processed${allOk ? "" : " (some may have failed)"}`
    );
  }
  process.exit(0);
}

// Install Playwright browsers if not already installed
function findPackageManager(): { name: string; command: string } | null {
  const managers = [
    { name: "bun", command: "bunx playwright install chromium" },
    { name: "pnpm", command: "pnpm exec playwright install chromium" },
    { name: "npm", command: "npx playwright install chromium" },
  ];

  for (const manager of managers) {
    try {
      execSync(`which ${manager.name}`, { stdio: "ignore" });
      return manager;
    } catch {
      // Package manager not found, try next
    }
  }
  return null;
}

function isChromiumInstalled(): boolean {
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const playwrightCacheDir = join(homeDir, ".cache", "ms-playwright");

  if (!existsSync(playwrightCacheDir)) {
    return false;
  }

  // Check for chromium directories (e.g., chromium-1148, chromium_headless_shell-1148)
  try {
    const entries = readdirSync(playwrightCacheDir);
    return entries.some((entry) => entry.startsWith("chromium"));
  } catch {
    return false;
  }
}

function installPlaywrightBrowsers(): void {
  try {
    if (!isChromiumInstalled()) {
      console.log("Playwright Chromium not found. Installing (this may take a minute)...");

      const pm = findPackageManager();
      if (!pm) {
        throw new Error("No package manager found (tried bun, pnpm, npm)");
      }

      console.log(`Using ${pm.name} to install Playwright...`);
      execSync(pm.command, { stdio: "inherit" });
      console.log("Chromium installed successfully.");
    } else {
      console.log("Playwright Chromium already installed.");
    }
  } catch (error) {
    console.error("Failed to install Playwright browsers:", error);
    console.log("You may need to run: npx playwright install chromium");
    if (args.installRequirements) {
      process.exit(1);
    }
  }
}

// Handle --install / --install-requirements: install deps and exit (no server start)
if (args.installRequirements) {
  console.log("Installing requirements...");

  // Install npm dependencies using npm ci
  const skillDir = join(__dirname, "..");
  console.log("Installing npm dependencies with npm ci...");
  execSync("npm ci", { cwd: skillDir, stdio: "inherit" });
  console.log("npm dependencies installed successfully.");

  // Create necessary directories
  const profileDir = join(__dirname, "..", "profiles");
  mkdirSync(tmpDir, { recursive: true });
  mkdirSync(profileDir, { recursive: true });
  console.log(`Created tmp directory: ${tmpDir}`);
  console.log(`Created profiles directory: ${profileDir}`);

  // Install Playwright browsers
  installPlaywrightBrowsers();

  console.log("\nAll requirements installed successfully.");
  process.exit(0);
}

// Auto-install npm dependencies if node_modules is missing
ensureDependenciesInstalled(join(__dirname, ".."));

// Resolve final config: CLI args > env vars > defaults
const config = resolveConfig(args);
const profileDir = config.profileDir ?? join(__dirname, "..", "profiles");

// Warn if DEV_BROWSER_DISABLE_HEADFUL is active and --headful was requested
if (process.env.DEV_BROWSER_DISABLE_HEADFUL === "true" && args.headful) {
  console.log("Warning: --headful flag ignored because DEV_BROWSER_DISABLE_HEADFUL=true is set");
}

// Create tmp and profile directories if they don't exist
console.log("Creating tmp directory...");
mkdirSync(tmpDir, { recursive: true });
console.log("Creating profiles directory...");
mkdirSync(profileDir, { recursive: true });

// Install Playwright browsers if not already installed
console.log("Checking Playwright browser installation...");
installPlaywrightBrowsers();

// Clean up orphaned Chrome processes from previous crashed instances
const orphansCleaned = cleanOrphanedChrome();
if (orphansCleaned > 0) {
  console.log(`Cleaned ${orphansCleaned} orphaned Chrome process(es) from previous crashes`);
}

// Port auto-selection: find an available port pair
// If user explicitly set --cdp-port, skip auto-selection (just validate the pair)
const explicitCdpPort = args.cdpPort !== undefined ? config.cdpPort : undefined;
console.log(`Finding available port (requested: ${config.port})...`);

const portResult = await findAvailablePort(config.port, explicitCdpPort);

if (portResult.wasAutoSelected) {
  console.log(`Server started on port ${portResult.port} (${portResult.requestedPort} was in use)`);
} else {
  console.log(`Port ${portResult.port} is available`);
}

// Clean up stale CDP port if HTTP server isn't running (crash recovery)
try {
  const pid = execSync(`lsof -ti:${portResult.cdpPort}`, { encoding: "utf-8" }).trim();
  if (pid) {
    console.log(`Cleaning up stale Chrome process on CDP port ${portResult.cdpPort} (PID: ${pid})`);
    execSync(`kill -9 ${pid}`);
  }
} catch {
  // No process on CDP port, which is expected
}

console.log(`Browser mode: ${config.headless ? "headless" : "headful"}`);
console.log("Starting dev browser server...");
const server = await serve({
  port: portResult.port,
  headless: config.headless,
  cdpPort: portResult.cdpPort,
  profileDir,
  cookies: config.cookies,
  label: config.label,
});

console.log(`Dev browser server started`);
console.log(`  HTTP API: http://localhost:${portResult.port}`);
console.log(`  CDP port: ${portResult.cdpPort}`);
console.log(`  WebSocket: ${server.wsEndpoint}`);
console.log(`  Tmp directory: ${tmpDir}`);
console.log(`  Profile directory: ${profileDir}`);
console.log(`  Label: ${config.label ?? process.cwd()}`);
if (portResult.wasAutoSelected) {
  console.log(
    `  Note: Auto-selected port ${portResult.port} (${portResult.requestedPort} was in use)`
  );
}
console.log(`\nReady`);
console.log(`\nPress Ctrl+C to stop`);

// Keep the process running
await new Promise(() => {});
