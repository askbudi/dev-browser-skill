/**
 * Instance Registry for dev-browser-skill.
 *
 * Stores one JSON file per running instance in ~/.dev-browser-skill/instances/{port}.json.
 * Used by --status to list running instances and detect stale ones.
 */

import { mkdirSync, writeFileSync, readFileSync, unlinkSync, readdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export interface InstanceInfo {
  pid: number;
  port: number;
  cdpPort: number;
  mode: "launch" | "relay";
  label: string;
  headless: boolean;
  startedAt: string;
  profileDir: string | undefined;
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
