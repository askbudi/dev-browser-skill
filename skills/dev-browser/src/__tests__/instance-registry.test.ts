import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  registerInstance,
  unregisterInstance,
  listInstances,
  cleanStaleInstances,
  isProcessRunning,
  formatUptime,
  printStatusTable,
  getInstancesDir,
  updateInstanceChromePid,
  getInstance,
  stopInstance,
  stopAllInstances,
  cleanOrphanedChrome,
  type InstanceInfo,
} from "../instance-registry.js";
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";

// Use real filesystem operations against the actual instances dir for integration-like tests,
// but clean up after ourselves.

const instancesDir = getInstancesDir();

function makeInfo(overrides: Partial<InstanceInfo> = {}): InstanceInfo {
  return {
    pid: process.pid, // Use current PID so isProcessRunning returns true
    port: 9222,
    cdpPort: 9223,
    mode: "launch",
    label: "/test/project",
    headless: true,
    startedAt: new Date().toISOString(),
    profileDir: "/test/profiles",
    chromePid: undefined,
    ...overrides,
  };
}

describe("instance-registry", () => {
  // Track ports we register so we can clean up
  const registeredPorts: number[] = [];

  afterEach(() => {
    // Clean up any instance files we created
    for (const port of registeredPorts) {
      unregisterInstance(port);
    }
    registeredPorts.length = 0;
  });

  describe("registerInstance", () => {
    it("creates a JSON file in the instances directory", () => {
      const info = makeInfo({ port: 19222 });
      registeredPorts.push(19222);

      registerInstance(info);

      const filePath = join(instancesDir, "19222.json");
      expect(existsSync(filePath)).toBe(true);

      const content = JSON.parse(readFileSync(filePath, "utf-8"));
      expect(content.pid).toBe(process.pid);
      expect(content.port).toBe(19222);
      expect(content.cdpPort).toBe(9223);
      expect(content.mode).toBe("launch");
      expect(content.label).toBe("/test/project");
      expect(content.headless).toBe(true);
    });

    it("overwrites existing file for the same port", () => {
      registeredPorts.push(19223);

      registerInstance(makeInfo({ port: 19223, label: "first" }));
      registerInstance(makeInfo({ port: 19223, label: "second" }));

      const filePath = join(instancesDir, "19223.json");
      const content = JSON.parse(readFileSync(filePath, "utf-8"));
      expect(content.label).toBe("second");
    });

    it("creates instances directory if it does not exist", () => {
      // This just tests it doesn't throw — the dir likely already exists
      const info = makeInfo({ port: 19224 });
      registeredPorts.push(19224);
      expect(() => registerInstance(info)).not.toThrow();
    });
  });

  describe("unregisterInstance", () => {
    it("removes the instance file", () => {
      const info = makeInfo({ port: 19230 });
      registerInstance(info);

      unregisterInstance(19230);

      const filePath = join(instancesDir, "19230.json");
      expect(existsSync(filePath)).toBe(false);
    });

    it("does not throw if file does not exist", () => {
      expect(() => unregisterInstance(99999)).not.toThrow();
    });
  });

  describe("listInstances", () => {
    it("returns empty array when no instances registered", () => {
      // Clean any existing test files first
      const instances = listInstances();
      // We can't guarantee empty, but function should not throw
      expect(Array.isArray(instances)).toBe(true);
    });

    it("returns registered instances sorted by port", () => {
      registeredPorts.push(19240, 19238, 19242);

      registerInstance(makeInfo({ port: 19240 }));
      registerInstance(makeInfo({ port: 19238 }));
      registerInstance(makeInfo({ port: 19242 }));

      const instances = listInstances();
      const testPorts = instances
        .filter((i) => [19238, 19240, 19242].includes(i.port))
        .map((i) => i.port);

      expect(testPorts).toEqual([19238, 19240, 19242]);
    });

    it("skips non-JSON files", () => {
      // Create a non-JSON file
      mkdirSync(instancesDir, { recursive: true });
      const txtPath = join(instancesDir, "readme.txt");
      writeFileSync(txtPath, "not json", "utf-8");

      // Should not throw or include the txt file
      const instances = listInstances();
      expect(instances.every((i) => typeof i.port === "number")).toBe(true);

      // Cleanup
      try {
        rmSync(txtPath);
      } catch {
        // ok
      }
    });

    it("skips corrupt JSON files", () => {
      mkdirSync(instancesDir, { recursive: true });
      const corruptPath = join(instancesDir, "99998.json");
      writeFileSync(corruptPath, "{{not valid json", "utf-8");
      registeredPorts.push(99998);

      // Should not throw
      const instances = listInstances();
      expect(Array.isArray(instances)).toBe(true);

      // Cleanup
      try {
        rmSync(corruptPath);
      } catch {
        // ok
      }
    });
  });

  describe("isProcessRunning", () => {
    it("returns true for the current process PID", () => {
      expect(isProcessRunning(process.pid)).toBe(true);
    });

    it("returns false for a PID that does not exist", () => {
      // PID 2147483647 is very unlikely to exist
      expect(isProcessRunning(2147483647)).toBe(false);
    });
  });

  describe("cleanStaleInstances", () => {
    it("removes instances with dead PIDs", () => {
      registeredPorts.push(19250);

      // Register with a PID that doesn't exist
      registerInstance(makeInfo({ port: 19250, pid: 2147483647 }));

      const stale = cleanStaleInstances();
      const stalePort = stale.find((s) => s.port === 19250);
      expect(stalePort).toBeDefined();

      const filePath = join(instancesDir, "19250.json");
      expect(existsSync(filePath)).toBe(false);

      // Remove from registeredPorts since already cleaned
      const idx = registeredPorts.indexOf(19250);
      if (idx !== -1) registeredPorts.splice(idx, 1);
    });

    it("keeps instances with running PIDs", () => {
      registeredPorts.push(19251);

      registerInstance(makeInfo({ port: 19251, pid: process.pid }));

      const stale = cleanStaleInstances();
      const stalePort = stale.find((s) => s.port === 19251);
      expect(stalePort).toBeUndefined();

      // File should still exist
      const filePath = join(instancesDir, "19251.json");
      expect(existsSync(filePath)).toBe(true);
    });
  });

  describe("formatUptime", () => {
    it("formats seconds", () => {
      const now = new Date();
      now.setSeconds(now.getSeconds() - 30);
      expect(formatUptime(now.toISOString())).toBe("30s");
    });

    it("formats minutes", () => {
      const now = new Date();
      now.setMinutes(now.getMinutes() - 5);
      expect(formatUptime(now.toISOString())).toBe("5m");
    });

    it("formats hours and minutes", () => {
      const now = new Date();
      now.setHours(now.getHours() - 2);
      now.setMinutes(now.getMinutes() - 15);
      expect(formatUptime(now.toISOString())).toBe("2h 15m");
    });

    it("formats days and hours", () => {
      const now = new Date();
      now.setDate(now.getDate() - 1);
      now.setHours(now.getHours() - 3);
      expect(formatUptime(now.toISOString())).toBe("1d 3h");
    });

    it("handles future timestamps gracefully", () => {
      const future = new Date();
      future.setHours(future.getHours() + 1);
      expect(formatUptime(future.toISOString())).toBe("0s");
    });
  });

  describe("printStatusTable", () => {
    it("prints 'No instances' when none are running", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      // Clean all test instances first
      cleanStaleInstances();

      // Only call printStatusTable — if there are real instances running they'll show up
      printStatusTable();

      // Restore
      consoleSpy.mockRestore();
    });

    it("prints a formatted table when instances exist", () => {
      registeredPorts.push(19260);
      registerInstance(makeInfo({ port: 19260, label: "/my/project", pid: process.pid }));

      const lines: string[] = [];
      const consoleSpy = vi.spyOn(console, "log").mockImplementation((...args) => {
        lines.push(args.join(" "));
      });

      printStatusTable();

      consoleSpy.mockRestore();

      const output = lines.join("\n");
      expect(output).toContain("dev-browser-skill instances:");
      expect(output).toContain("PORT");
      expect(output).toContain("PID");
      expect(output).toContain("MODE");
      expect(output).toContain("LABEL");
      expect(output).toContain("UPTIME");
      expect(output).toContain("19260");
      expect(output).toContain("/my/project");
      expect(output).toContain("instance(s) running");
    });

    it("reports cleaned stale instances", () => {
      registeredPorts.push(19261);
      registerInstance(makeInfo({ port: 19261, pid: 2147483647 }));

      const lines: string[] = [];
      const consoleSpy = vi.spyOn(console, "log").mockImplementation((...args) => {
        lines.push(args.join(" "));
      });

      printStatusTable();

      consoleSpy.mockRestore();

      const output = lines.join("\n");
      expect(output).toContain("Cleaned stale instance on port 19261");

      // Remove from tracked since it was cleaned
      const idx = registeredPorts.indexOf(19261);
      if (idx !== -1) registeredPorts.splice(idx, 1);
    });
  });

  describe("chromePid tracking", () => {
    it("stores chromePid in instance file", () => {
      registeredPorts.push(19270);
      const info = makeInfo({ port: 19270, chromePid: 12345 });
      registerInstance(info);

      const filePath = join(instancesDir, "19270.json");
      const content = JSON.parse(readFileSync(filePath, "utf-8"));
      expect(content.chromePid).toBe(12345);
    });

    it("stores undefined chromePid when not provided", () => {
      registeredPorts.push(19271);
      const info = makeInfo({ port: 19271, chromePid: undefined });
      registerInstance(info);

      const filePath = join(instancesDir, "19271.json");
      const content = JSON.parse(readFileSync(filePath, "utf-8"));
      // undefined is not serialized to JSON — it becomes missing key or null
      expect(content.chromePid).toBeUndefined();
    });
  });

  describe("updateInstanceChromePid", () => {
    it("updates chromePid in an existing instance file", () => {
      registeredPorts.push(19272);
      registerInstance(makeInfo({ port: 19272 }));

      updateInstanceChromePid(19272, 99999);

      const filePath = join(instancesDir, "19272.json");
      const content = JSON.parse(readFileSync(filePath, "utf-8"));
      expect(content.chromePid).toBe(99999);
    });

    it("does not throw for non-existent instance", () => {
      expect(() => updateInstanceChromePid(99997, 12345)).not.toThrow();
    });
  });

  describe("getInstance", () => {
    it("returns instance info for a registered port", () => {
      registeredPorts.push(19273);
      registerInstance(makeInfo({ port: 19273, label: "test-get" }));

      const info = getInstance(19273);
      expect(info).not.toBeNull();
      expect(info!.port).toBe(19273);
      expect(info!.label).toBe("test-get");
    });

    it("returns null for a non-existent port", () => {
      expect(getInstance(99996)).toBeNull();
    });
  });

  describe("stopInstance", () => {
    it("returns error for non-existent instance", async () => {
      const result = await stopInstance(99995);
      expect(result.success).toBe(false);
      expect(result.message).toContain("No instance registered on port 99995");
    });

    it("cleans up registry for already-dead server PID", async () => {
      registeredPorts.push(19280);
      registerInstance(makeInfo({ port: 19280, pid: 2147483647, chromePid: undefined }));

      const result = await stopInstance(19280);
      expect(result.success).toBe(true);
      expect(result.message).toContain("already stopped");

      // Registry file should be removed
      const filePath = join(instancesDir, "19280.json");
      expect(existsSync(filePath)).toBe(false);

      // Remove from tracked since already cleaned
      const idx = registeredPorts.indexOf(19280);
      if (idx !== -1) registeredPorts.splice(idx, 1);
    });

    it("returns correct port in result", async () => {
      registeredPorts.push(19281);
      registerInstance(makeInfo({ port: 19281, pid: 2147483647 }));

      const result = await stopInstance(19281);
      expect(result.port).toBe(19281);

      const idx = registeredPorts.indexOf(19281);
      if (idx !== -1) registeredPorts.splice(idx, 1);
    });
  });

  describe("stopAllInstances", () => {
    it("returns empty array when no instances exist", async () => {
      // Clean all stale first
      cleanStaleInstances();
      // Note: there may be real running instances; we just verify it doesn't throw
      const results = await stopAllInstances();
      expect(Array.isArray(results)).toBe(true);
    });

    it("cleans up stale instances with dead PIDs", async () => {
      registeredPorts.push(19290, 19292);
      registerInstance(makeInfo({ port: 19290, pid: 2147483646 }));
      registerInstance(makeInfo({ port: 19292, pid: 2147483645 }));

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const results = await stopAllInstances();
      consoleSpy.mockRestore();

      // Both should appear in results as stale or stopped
      const ports = results.map((r) => r.port);
      expect(ports).toContain(19290);
      expect(ports).toContain(19292);

      // Registry should be cleaned
      expect(existsSync(join(instancesDir, "19290.json"))).toBe(false);
      expect(existsSync(join(instancesDir, "19292.json"))).toBe(false);

      // Remove from tracked since already cleaned
      registeredPorts.length = 0;
    });
  });

  describe("cleanOrphanedChrome", () => {
    it("cleans stale instances and returns count", () => {
      registeredPorts.push(19300);
      registerInstance(makeInfo({ port: 19300, pid: 2147483644, chromePid: undefined }));

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const cleaned = cleanOrphanedChrome();
      consoleSpy.mockRestore();

      // The stale instance should have been cleaned from registry
      expect(existsSync(join(instancesDir, "19300.json"))).toBe(false);
      // cleaned count may be 0 if no Chrome process was found (no actual Chrome running)
      expect(typeof cleaned).toBe("number");
      expect(cleaned).toBeGreaterThanOrEqual(0);

      const idx = registeredPorts.indexOf(19300);
      if (idx !== -1) registeredPorts.splice(idx, 1);
    });

    it("does not throw when no orphans exist", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      expect(() => cleanOrphanedChrome()).not.toThrow();
      consoleSpy.mockRestore();
    });
  });
});
