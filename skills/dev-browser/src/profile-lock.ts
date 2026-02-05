/**
 * Profile directory locking for multi-instance isolation.
 *
 * Prevents two server instances from using the same browser profile directory
 * simultaneously, which would cause data corruption.
 *
 * Lock file format: JSON with { pid, port, startedAt }
 * Location: <profileDir>/.dev-browser.lock
 */

import { writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { isProcessRunning } from "./instance-registry.js";

export interface LockInfo {
  pid: number;
  port: number;
  startedAt: string;
}

const LOCK_FILENAME = ".dev-browser.lock";

/**
 * Build the lock file path for a profile directory.
 */
export function lockFilePath(profileDir: string): string {
  return join(profileDir, LOCK_FILENAME);
}

/**
 * Read the current lock file, if it exists and is valid JSON.
 * Returns null if no lock exists or it is unreadable.
 */
export function readLock(profileDir: string): LockInfo | null {
  const path = lockFilePath(profileDir);
  if (!existsSync(path)) return null;

  try {
    const raw = readFileSync(path, "utf-8");
    const data = JSON.parse(raw) as LockInfo;
    if (typeof data.pid !== "number" || typeof data.port !== "number") {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

/**
 * Attempt to acquire a lock on the profile directory.
 *
 * - If no lock exists → creates it and returns.
 * - If a lock exists with a dead PID → removes stale lock, creates new one.
 * - If a lock exists with a live PID → throws an error with info about the conflicting instance.
 */
export function acquireProfileLock(profileDir: string, port: number): void {
  mkdirSync(profileDir, { recursive: true });

  const existing = readLock(profileDir);

  if (existing !== null) {
    if (isProcessRunning(existing.pid)) {
      throw new Error(
        `Profile directory "${profileDir}" is locked by another instance ` +
          `(PID ${existing.pid}, port ${existing.port}, started ${existing.startedAt}). ` +
          `Use a different --profile-dir or stop the other instance first.`
      );
    }

    // Stale lock — previous instance crashed. Clean it up.
    console.log(`Removing stale profile lock (PID ${existing.pid} is no longer running)`);
    removeLock(profileDir);
  }

  // Write the lock file using exclusive create (wx) for atomicity.
  // If two processes race, one will get EEXIST.
  const lockData: LockInfo = {
    pid: process.pid,
    port,
    startedAt: new Date().toISOString(),
  };

  const path = lockFilePath(profileDir);
  try {
    writeFileSync(path, JSON.stringify(lockData, null, 2) + "\n", { flag: "wx" });
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "EEXIST") {
      // Another process won the race — re-read and report
      const winner = readLock(profileDir);
      if (winner && isProcessRunning(winner.pid)) {
        throw new Error(
          `Profile directory "${profileDir}" was just locked by PID ${winner.pid} on port ${winner.port}.`
        );
      }
      // Winner already died — try once more
      removeLock(profileDir);
      writeFileSync(path, JSON.stringify(lockData, null, 2) + "\n", { flag: "wx" });
    } else {
      throw err;
    }
  }
}

/**
 * Remove the lock file. Called on graceful shutdown.
 * Does not throw if file doesn't exist.
 */
export function removeLock(profileDir: string): void {
  try {
    unlinkSync(lockFilePath(profileDir));
  } catch {
    // Already gone — fine
  }
}
