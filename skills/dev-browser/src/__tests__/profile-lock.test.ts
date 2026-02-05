import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { acquireProfileLock, removeLock, readLock, lockFilePath } from "../profile-lock.js";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const TEST_BASE = join(tmpdir(), "dev-browser-profile-lock-tests");

function testDir(name: string): string {
  return join(TEST_BASE, name);
}

describe("profile-lock", () => {
  beforeEach(() => {
    mkdirSync(TEST_BASE, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(TEST_BASE, { recursive: true, force: true });
    } catch {
      // Best effort
    }
  });

  describe("lockFilePath", () => {
    it("returns .dev-browser.lock in the profile directory", () => {
      expect(lockFilePath("/some/dir")).toBe("/some/dir/.dev-browser.lock");
    });
  });

  describe("readLock", () => {
    it("returns null if no lock file exists", () => {
      const dir = testDir("no-lock");
      mkdirSync(dir, { recursive: true });
      expect(readLock(dir)).toBeNull();
    });

    it("returns lock info when a valid lock file exists", () => {
      const dir = testDir("valid-lock");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, ".dev-browser.lock"),
        JSON.stringify({ pid: 12345, port: 9222, startedAt: "2026-01-01T00:00:00Z" }),
        "utf-8"
      );

      const lock = readLock(dir);
      expect(lock).not.toBeNull();
      expect(lock!.pid).toBe(12345);
      expect(lock!.port).toBe(9222);
    });

    it("returns null for corrupt lock file", () => {
      const dir = testDir("corrupt-lock");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, ".dev-browser.lock"), "{{not json", "utf-8");
      expect(readLock(dir)).toBeNull();
    });

    it("returns null for lock file missing required fields", () => {
      const dir = testDir("incomplete-lock");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, ".dev-browser.lock"),
        JSON.stringify({ pid: "not-a-number" }),
        "utf-8"
      );
      expect(readLock(dir)).toBeNull();
    });
  });

  describe("acquireProfileLock", () => {
    it("creates a lock file when no lock exists", () => {
      const dir = testDir("acquire-fresh");
      mkdirSync(dir, { recursive: true });

      acquireProfileLock(dir, 9222);

      const lock = readLock(dir);
      expect(lock).not.toBeNull();
      expect(lock!.pid).toBe(process.pid);
      expect(lock!.port).toBe(9222);

      // Cleanup
      removeLock(dir);
    });

    it("creates the directory if it does not exist", () => {
      const dir = testDir("nonexistent-dir/nested");

      acquireProfileLock(dir, 9222);

      expect(existsSync(dir)).toBe(true);
      const lock = readLock(dir);
      expect(lock).not.toBeNull();

      removeLock(dir);
    });

    it("removes stale lock and acquires when PID is dead", () => {
      const dir = testDir("stale-lock");
      mkdirSync(dir, { recursive: true });

      // Create a stale lock with a non-existent PID
      writeFileSync(
        join(dir, ".dev-browser.lock"),
        JSON.stringify({ pid: 2147483647, port: 9222, startedAt: "2026-01-01T00:00:00Z" }),
        "utf-8"
      );

      // Should succeed — stale lock gets cleaned up
      acquireProfileLock(dir, 9224);

      const lock = readLock(dir);
      expect(lock).not.toBeNull();
      expect(lock!.pid).toBe(process.pid);
      expect(lock!.port).toBe(9224);

      removeLock(dir);
    });

    it("throws when lock is held by a running process", () => {
      const dir = testDir("live-lock");
      mkdirSync(dir, { recursive: true });

      // Create a lock with OUR PID (definitely running)
      writeFileSync(
        join(dir, ".dev-browser.lock"),
        JSON.stringify({ pid: process.pid, port: 9222, startedAt: "2026-01-01T00:00:00Z" }),
        "utf-8"
      );

      expect(() => acquireProfileLock(dir, 9224)).toThrow(/locked by another instance/);

      // Cleanup
      removeLock(dir);
    });

    it("includes conflicting instance info in error message", () => {
      const dir = testDir("lock-error-info");
      mkdirSync(dir, { recursive: true });

      writeFileSync(
        join(dir, ".dev-browser.lock"),
        JSON.stringify({ pid: process.pid, port: 8888, startedAt: "2026-01-01T00:00:00Z" }),
        "utf-8"
      );

      try {
        acquireProfileLock(dir, 9224);
        expect.unreachable("Should have thrown");
      } catch (err) {
        const msg = (err as Error).message;
        expect(msg).toContain(`PID ${process.pid}`);
        expect(msg).toContain("port 8888");
        expect(msg).toContain("2026-01-01");
      }

      removeLock(dir);
    });
  });

  describe("removeLock", () => {
    it("removes an existing lock file", () => {
      const dir = testDir("remove-existing");
      mkdirSync(dir, { recursive: true });
      acquireProfileLock(dir, 9222);

      expect(readLock(dir)).not.toBeNull();

      removeLock(dir);
      expect(readLock(dir)).toBeNull();
    });

    it("does not throw if lock file does not exist", () => {
      const dir = testDir("remove-nonexistent");
      mkdirSync(dir, { recursive: true });
      expect(() => removeLock(dir)).not.toThrow();
    });
  });
});
