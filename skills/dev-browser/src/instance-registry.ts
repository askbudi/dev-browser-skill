/**
 * Instance Registry for dev-browser-skill.
 *
 * Stores one JSON file per running instance in ~/.dev-browser-skill/instances/{port}.json.
 * Used by --status to list running instances and detect stale ones.
 */

import { mkdirSync, writeFileSync, readFileSync, unlinkSync, readdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { execSync } from "child_process";

export interface InstanceInfo {
  pid: number;
  port: number;
  cdpPort: number;
  mode: "launch" | "relay";
  label: string;
  headless: boolean;
  startedAt: string;
  profileDir: string | undefined;
  chromePid: number | undefined;
}

const INSTANCES_DIR = join(homedir(), ".dev-browser-skill", "instances");

/**
 * Get the instances directory path. Exported for testing.
 */
export function getInstancesDir(): string {
  return INSTANCES_DIR;
}

/**
 * Ensure the instances directory exists.
 */
function ensureDir(): void {
  mkdirSync(INSTANCES_DIR, { recursive: true });
}

/**
 * Build the path for a given port's instance file.
 */
function instancePath(port: number): string {
  return join(INSTANCES_DIR, `${port}.json`);
}

/**
 * Register a running instance. Writes {port}.json to the instances directory.
 */
export function registerInstance(info: InstanceInfo): void {
  ensureDir();
  writeFileSync(instancePath(info.port), JSON.stringify(info, null, 2) + "\n", "utf-8");
}

/**
 * Unregister an instance (called on graceful shutdown).
 */
export function unregisterInstance(port: number): void {
  try {
    unlinkSync(instancePath(port));
  } catch {
    // File may already be gone — that's fine
  }
}

/**
 * Check if a process with the given PID is still running.
 */
export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0); // signal 0 = check existence only
    return true;
  } catch {
    return false;
  }
}

/**
 * List all registered instances. Does NOT clean stale entries (use cleanStaleInstances for that).
 */
export function listInstances(): InstanceInfo[] {
  ensureDir();
  const results: InstanceInfo[] = [];

  let files: string[];
  try {
    files = readdirSync(INSTANCES_DIR);
  } catch {
    return results;
  }

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = readFileSync(join(INSTANCES_DIR, file), "utf-8");
      const info = JSON.parse(raw) as InstanceInfo;
      results.push(info);
    } catch {
      // Corrupt or unreadable file — skip
    }
  }

  // Sort by port for consistent output
  results.sort((a, b) => a.port - b.port);
  return results;
}

/**
 * Remove registry files for instances whose PID is no longer running.
 * Returns the list of stale instances that were cleaned.
 */
export function cleanStaleInstances(): InstanceInfo[] {
  const all = listInstances();
  const stale: InstanceInfo[] = [];

  for (const info of all) {
    if (!isProcessRunning(info.pid)) {
      stale.push(info);
      unregisterInstance(info.port);
    }
  }

  return stale;
}

/**
 * Format uptime from a startedAt ISO string to a human-readable string.
 */
export function formatUptime(startedAt: string): string {
  const start = new Date(startedAt).getTime();
  const now = Date.now();
  const diffMs = now - start;

  if (diffMs < 0) return "0s";

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

/**
 * Print a formatted status table for --status output.
 * Cleans stale instances first.
 */
export function printStatusTable(): void {
  const stale = cleanStaleInstances();
  if (stale.length > 0) {
    for (const s of stale) {
      console.log(`Cleaned stale instance on port ${s.port} (PID ${s.pid} no longer running)`);
    }
  }

  const instances = listInstances();

  if (instances.length === 0) {
    console.log("No dev-browser-skill instances running.");
    return;
  }

  console.log("dev-browser-skill instances:\n");

  // Column headers
  const header = `  ${"PORT".padEnd(7)}${"PID".padEnd(10)}${"MODE".padEnd(10)}${"LABEL".padEnd(50)}UPTIME`;
  console.log(header);

  for (const info of instances) {
    const uptime = formatUptime(info.startedAt);
    const line = `  ${String(info.port).padEnd(7)}${String(info.pid).padEnd(10)}${info.mode.padEnd(10)}${info.label.slice(0, 48).padEnd(50)}${uptime}`;
    console.log(line);
  }

  console.log(`\n${instances.length} instance(s) running`);
}

/**
 * Update the chromePid field for a registered instance.
 */
export function updateInstanceChromePid(port: number, chromePid: number): void {
  const filePath = instancePath(port);
  try {
    const raw = readFileSync(filePath, "utf-8");
    const info = JSON.parse(raw) as InstanceInfo;
    info.chromePid = chromePid;
    writeFileSync(filePath, JSON.stringify(info, null, 2) + "\n", "utf-8");
  } catch {
    // Instance file may have been removed — ignore
  }
}

/**
 * Read a single instance's info by port.
 */
export function getInstance(port: number): InstanceInfo | null {
  try {
    const raw = readFileSync(instancePath(port), "utf-8");
    return JSON.parse(raw) as InstanceInfo;
  } catch {
    return null;
  }
}

/**
 * Send a signal to a process. Returns true if the signal was sent successfully.
 */
function sendSignal(pid: number, signal: NodeJS.Signals | number): boolean {
  try {
    process.kill(pid, signal);
    return true;
  } catch {
    return false;
  }
}

/**
 * Wait for a process to exit, checking every interval up to timeoutMs.
 * Returns true if the process exited, false if still running after timeout.
 */
function waitForExit(pid: number, timeoutMs: number, intervalMs = 200): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      if (!isProcessRunning(pid)) {
        resolve(true);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(check, intervalMs);
    };
    check();
  });
}

export interface StopResult {
  port: number;
  success: boolean;
  message: string;
}

/**
 * Stop a specific instance by port.
 * Sends SIGTERM, waits up to 5s, then SIGKILL if needed.
 * Also ensures the Chrome process is terminated.
 */
export async function stopInstance(port: number): Promise<StopResult> {
  const info = getInstance(port);
  if (!info) {
    return { port, success: false, message: `No instance registered on port ${port}` };
  }

  if (!isProcessRunning(info.pid)) {
    // Server already dead — clean up Chrome if still running
    if (info.chromePid && isProcessRunning(info.chromePid)) {
      sendSignal(info.chromePid, "SIGKILL");
      console.log(`Killed orphaned Chrome process (PID ${info.chromePid}) for port ${port}`);
    }
    unregisterInstance(port);
    return {
      port,
      success: true,
      message: `Instance on port ${port} was already stopped (cleaned registry)`,
    };
  }

  // Send SIGTERM to the server process (it should trigger its cleanup handler)
  console.log(`Sending SIGTERM to server PID ${info.pid} on port ${port}...`);
  sendSignal(info.pid, "SIGTERM");

  // Wait up to 5s for graceful shutdown
  const serverExited = await waitForExit(info.pid, 5000);

  if (!serverExited) {
    // Force kill the server
    console.log(`Server PID ${info.pid} did not exit after 5s, sending SIGKILL...`);
    sendSignal(info.pid, "SIGKILL");
    await waitForExit(info.pid, 2000);
  }

  // Ensure Chrome process is also gone
  if (info.chromePid && isProcessRunning(info.chromePid)) {
    console.log(`Chrome PID ${info.chromePid} still running, sending SIGKILL...`);
    sendSignal(info.chromePid, "SIGKILL");
    await waitForExit(info.chromePid, 2000);
  }

  // Clean up the registry file
  unregisterInstance(port);

  const serverGone = !isProcessRunning(info.pid);
  const chromeGone = !info.chromePid || !isProcessRunning(info.chromePid);

  if (serverGone && chromeGone) {
    return { port, success: true, message: `Instance on port ${port} stopped successfully` };
  }

  return {
    port,
    success: false,
    message: `Instance on port ${port} may not have fully stopped (server: ${serverGone ? "stopped" : "running"}, chrome: ${chromeGone ? "stopped" : "running"})`,
  };
}

/**
 * Stop all registered instances.
 */
export async function stopAllInstances(): Promise<StopResult[]> {
  const stale = cleanStaleInstances();
  const results: StopResult[] = [];

  // Report cleaned stale instances
  for (const s of stale) {
    // Kill orphaned Chrome processes from stale entries
    if (s.chromePid && isProcessRunning(s.chromePid)) {
      sendSignal(s.chromePid, "SIGKILL");
      console.log(
        `Killed orphaned Chrome process (PID ${s.chromePid}) from stale instance on port ${s.port}`
      );
    }
    results.push({
      port: s.port,
      success: true,
      message: `Stale instance on port ${s.port} cleaned (server PID ${s.pid} was not running)`,
    });
  }

  // Stop all live instances
  const liveInstances = listInstances();
  for (const info of liveInstances) {
    const result = await stopInstance(info.port);
    results.push(result);
  }

  return results;
}

/**
 * Detect and kill orphaned Chrome processes from previous crashed instances.
 * Checks for Chrome processes with --remote-debugging-port matching known CDP ports
 * where the server process is no longer running.
 */
export function cleanOrphanedChrome(): number {
  const stale = cleanStaleInstances();
  let cleaned = 0;

  // For each stale instance, check if Chrome process is still running
  for (const info of stale) {
    if (info.chromePid && isProcessRunning(info.chromePid)) {
      sendSignal(info.chromePid, "SIGKILL");
      console.log(
        `Cleaned orphaned Chrome process (PID ${info.chromePid}) from crashed instance on port ${info.port}`
      );
      cleaned++;
    }
  }

  // Also scan for orphaned Chrome processes by checking for --remote-debugging-port
  // that don't match any registered instance
  try {
    const pgrepOutput = execSync("pgrep -f 'remote-debugging-port'", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();

    if (!pgrepOutput) return cleaned;

    const chromePids = pgrepOutput
      .split("\n")
      .map((p) => parseInt(p.trim(), 10))
      .filter((p) => !isNaN(p));

    // Get currently registered (live) instance Chrome PIDs
    const liveInstances = listInstances();
    const liveChromePids = new Set(
      liveInstances.filter((i) => i.chromePid).map((i) => i.chromePid!)
    );
    const liveServerPids = new Set(liveInstances.map((i) => i.pid));

    for (const chromePid of chromePids) {
      // Skip if this Chrome PID belongs to a live registered instance
      if (liveChromePids.has(chromePid)) continue;
      // Skip if this is actually a server PID (pgrep might match our own processes)
      if (liveServerPids.has(chromePid)) continue;
      // Skip our own PID
      if (chromePid === process.pid) continue;

      // This is an orphaned Chrome process — kill it
      sendSignal(chromePid, "SIGKILL");
      console.log(`Cleaned orphaned Chrome process (PID ${chromePid})`);
      cleaned++;
    }
  } catch {
    // pgrep returns exit code 1 if no matches — that's fine
  }

  return cleaned;
}
