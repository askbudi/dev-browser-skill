import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "path";
import {
  getGlobalDepsDir,
  computeFileHash,
  installGlobalDeps,
  cleanGlobalDeps,
  hasGlobalDeps,
  checkVersionCoherence,
  getGlobalNodePath,
  resolveDepSource,
} from "../global-deps.js";

/**
 * Tests for the global dependency management module.
 *
 * Global deps allow multiple projects to share a single node_modules
 * (~80MB) instead of duplicating per project. This reduces disk usage
 * and install time when dev-browser-skill is used across many projects.
 *
 * The module uses NODE_PATH (standard Node.js mechanism) to resolve
 * modules from ~/.dev-browser-skill/global-deps/node_modules/.
 */

// Mock fs and child_process to avoid real filesystem and npm operations
vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    copyFileSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    rmSync: vi.fn(),
  };
});

vi.mock("child_process", () => ({
  execSync: vi.fn(),
}));

import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from "fs";
import { execSync } from "child_process";
import { homedir } from "os";

const mockedExistsSync = vi.mocked(existsSync);
const mockedMkdirSync = vi.mocked(mkdirSync);
const mockedCopyFileSync = vi.mocked(copyFileSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedRmSync = vi.mocked(rmSync);
const mockedExecSync = vi.mocked(execSync);

const DEFAULT_GLOBAL_DIR = join(homedir(), ".dev-browser-skill", "global-deps");

describe("getGlobalDepsDir", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.DEV_BROWSER_GLOBAL_DEPS_PATH;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns default directory when no config or env var", () => {
    expect(getGlobalDepsDir()).toBe(DEFAULT_GLOBAL_DIR);
  });

  it("uses config.globalDepsPath when provided", () => {
    expect(getGlobalDepsDir({ globalDepsPath: "/custom/path" })).toBe("/custom/path");
  });

  it("uses DEV_BROWSER_GLOBAL_DEPS_PATH env var when set", () => {
    process.env.DEV_BROWSER_GLOBAL_DEPS_PATH = "/env/path";
    expect(getGlobalDepsDir()).toBe("/env/path");
  });

  it("config.globalDepsPath takes priority over env var", () => {
    process.env.DEV_BROWSER_GLOBAL_DEPS_PATH = "/env/path";
    expect(getGlobalDepsDir({ globalDepsPath: "/config/path" })).toBe("/config/path");
  });
});

describe("computeFileHash", () => {
  it("computes SHA-256 hash of file contents", () => {
    mockedReadFileSync.mockReturnValue(Buffer.from("test content"));
    const hash = computeFileHash("/some/file");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(mockedReadFileSync).toHaveBeenCalledWith("/some/file");
  });

  it("produces different hashes for different content", () => {
    mockedReadFileSync.mockReturnValueOnce(Buffer.from("content A"));
    const hashA = computeFileHash("/file-a");

    mockedReadFileSync.mockReturnValueOnce(Buffer.from("content B"));
    const hashB = computeFileHash("/file-b");

    expect(hashA).not.toBe(hashB);
  });

  it("produces same hash for same content", () => {
    mockedReadFileSync.mockReturnValueOnce(Buffer.from("same content"));
    const hash1 = computeFileHash("/file-1");

    mockedReadFileSync.mockReturnValueOnce(Buffer.from("same content"));
    const hash2 = computeFileHash("/file-2");

    expect(hash1).toBe(hash2);
  });
});

describe("installGlobalDeps", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mockedReadFileSync.mockReturnValue(Buffer.from("lockfile content"));
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("throws if package.json not found", () => {
    mockedExistsSync.mockReturnValue(false);
    expect(() => installGlobalDeps("/skill")).toThrow("package.json not found");
  });

  it("throws if package-lock.json not found", () => {
    mockedExistsSync.mockImplementation((p) => {
      return String(p).endsWith("package.json");
    });
    expect(() => installGlobalDeps("/skill")).toThrow("package-lock.json not found");
  });

  it("creates global dir, copies files, runs npm ci, writes hash", () => {
    mockedExistsSync.mockReturnValue(true);

    installGlobalDeps("/skill");

    // Creates directory
    expect(mockedMkdirSync).toHaveBeenCalledWith(DEFAULT_GLOBAL_DIR, { recursive: true });

    // Copies package files
    expect(mockedCopyFileSync).toHaveBeenCalledWith(
      join("/skill", "package.json"),
      join(DEFAULT_GLOBAL_DIR, "package.json")
    );
    expect(mockedCopyFileSync).toHaveBeenCalledWith(
      join("/skill", "package-lock.json"),
      join(DEFAULT_GLOBAL_DIR, "package-lock.json")
    );

    // Runs npm ci
    expect(mockedExecSync).toHaveBeenCalledWith("npm ci", {
      cwd: DEFAULT_GLOBAL_DIR,
      stdio: "inherit",
    });

    // Writes lockfile hash
    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      join(DEFAULT_GLOBAL_DIR, ".lockfile-hash"),
      expect.stringMatching(/^[a-f0-9]{64}$/),
      "utf-8"
    );
  });

  it("uses custom path from config", () => {
    mockedExistsSync.mockReturnValue(true);

    installGlobalDeps("/skill", { globalDepsPath: "/custom" });

    expect(mockedMkdirSync).toHaveBeenCalledWith("/custom", { recursive: true });
    expect(mockedExecSync).toHaveBeenCalledWith("npm ci", {
      cwd: "/custom",
      stdio: "inherit",
    });
  });
});

describe("cleanGlobalDeps", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("removes the global deps directory when it exists", () => {
    mockedExistsSync.mockReturnValue(true);
    cleanGlobalDeps();
    expect(mockedRmSync).toHaveBeenCalledWith(DEFAULT_GLOBAL_DIR, {
      recursive: true,
      force: true,
    });
  });

  it("logs message when no global deps found", () => {
    mockedExistsSync.mockReturnValue(false);
    cleanGlobalDeps();
    expect(mockedRmSync).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("No global dependencies"));
  });

  it("uses custom path from config", () => {
    mockedExistsSync.mockReturnValue(true);
    cleanGlobalDeps({ globalDepsPath: "/custom" });
    expect(mockedRmSync).toHaveBeenCalledWith("/custom", { recursive: true, force: true });
  });
});

describe("hasGlobalDeps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when node_modules exists in global dir", () => {
    mockedExistsSync.mockReturnValue(true);
    expect(hasGlobalDeps()).toBe(true);
    expect(mockedExistsSync).toHaveBeenCalledWith(join(DEFAULT_GLOBAL_DIR, "node_modules"));
  });

  it("returns false when node_modules does not exist", () => {
    mockedExistsSync.mockReturnValue(false);
    expect(hasGlobalDeps()).toBe(false);
  });
});

describe("checkVersionCoherence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no local lockfile exists", () => {
    mockedExistsSync.mockReturnValue(false);
    expect(checkVersionCoherence("/skill")).toBeNull();
  });

  it("returns warning when global hash file is missing", () => {
    mockedExistsSync.mockImplementation((p) => {
      return String(p).endsWith("package-lock.json");
    });
    const result = checkVersionCoherence("/skill");
    expect(result).toContain("missing version hash");
  });

  it("returns null when hashes match", () => {
    mockedExistsSync.mockReturnValue(true);
    const content = Buffer.from("lockfile content");
    mockedReadFileSync.mockImplementation((p) => {
      if (String(p).endsWith(".lockfile-hash")) {
        // Return the hash of "lockfile content"
        const { createHash } = require("crypto");
        return createHash("sha256").update(content).digest("hex");
      }
      return content;
    });

    expect(checkVersionCoherence("/skill")).toBeNull();
  });

  it("returns warning when hashes differ", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockImplementation((p) => {
      if (String(p).endsWith(".lockfile-hash")) {
        return "oldhashvalue";
      }
      return Buffer.from("new lockfile content");
    });

    const result = checkVersionCoherence("/skill");
    expect(result).toContain("out of date");
  });
});

describe("getGlobalNodePath", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.DEV_BROWSER_GLOBAL_DEPS_PATH;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns node_modules path under default global dir", () => {
    expect(getGlobalNodePath()).toBe(join(DEFAULT_GLOBAL_DIR, "node_modules"));
  });

  it("uses custom path from config", () => {
    expect(getGlobalNodePath({ globalDepsPath: "/custom" })).toBe(join("/custom", "node_modules"));
  });
});

describe("resolveDepSource", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.DEV_BROWSER_GLOBAL_DEPS;
    delete process.env.DEV_BROWSER_GLOBAL_DEPS_PATH;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns 'local' when local node_modules exists (no env force)", () => {
    mockedExistsSync.mockImplementation((p) => {
      // local node_modules exists, global does not
      return String(p).includes("/skill/node_modules");
    });
    expect(resolveDepSource("/skill")).toBe("local");
  });

  it("returns 'global' when no local but global exists", () => {
    mockedExistsSync.mockImplementation((p) => {
      return String(p).includes("global-deps/node_modules");
    });
    expect(resolveDepSource("/skill")).toBe("global");
  });

  it("returns null when neither local nor global exists", () => {
    mockedExistsSync.mockReturnValue(false);
    expect(resolveDepSource("/skill")).toBeNull();
  });

  it("returns 'local' when both local and global exist (backward compat)", () => {
    mockedExistsSync.mockReturnValue(true);
    expect(resolveDepSource("/skill")).toBe("local");
  });

  it("returns 'global' when DEV_BROWSER_GLOBAL_DEPS=true and global exists", () => {
    process.env.DEV_BROWSER_GLOBAL_DEPS = "true";
    mockedExistsSync.mockReturnValue(true);
    expect(resolveDepSource("/skill")).toBe("global");
  });

  it("warns and falls back to local when DEV_BROWSER_GLOBAL_DEPS=true but no global deps", () => {
    process.env.DEV_BROWSER_GLOBAL_DEPS = "true";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    mockedExistsSync.mockImplementation((p) => {
      // Only local exists, global does not
      return String(p).includes("/skill/node_modules");
    });

    expect(resolveDepSource("/skill")).toBe("local");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("no global deps found"));
    warnSpy.mockRestore();
  });

  it("returns null when DEV_BROWSER_GLOBAL_DEPS=true but neither exists", () => {
    process.env.DEV_BROWSER_GLOBAL_DEPS = "true";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    mockedExistsSync.mockReturnValue(false);

    expect(resolveDepSource("/skill")).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
