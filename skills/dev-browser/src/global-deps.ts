/**
 * Global dependency management for dev-browser-skill.
 *
 * Allows installing npm dependencies to a shared system-level location
 * (~/.dev-browser-skill/global-deps/) so multiple projects can share one
 * node_modules instead of duplicating ~80MB per project.
 *
 * Uses NODE_PATH to add the global deps directory to Node.js module
 * resolution — the standard mechanism for extending module search paths.
 */

import { execSync } from "child_process";
import { createHash } from "crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const DEFAULT_GLOBAL_DEPS_DIR = join(homedir(), ".dev-browser-skill", "global-deps");

export interface GlobalDepsConfig {
  /** Override the global deps directory (default: ~/.dev-browser-skill/global-deps/) */
  globalDepsPath?: string;
}

/**
 * Get the global deps directory, respecting env var override.
 */
export function getGlobalDepsDir(config?: GlobalDepsConfig): string {
  if (config?.globalDepsPath) {
    return config.globalDepsPath;
  }
  return process.env.DEV_BROWSER_GLOBAL_DEPS_PATH || DEFAULT_GLOBAL_DEPS_DIR;
}

/**
 * Compute SHA-256 hash of a file's contents.
 */
export function computeFileHash(filePath: string): string {
  const content = readFileSync(filePath);
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Install dependencies globally to the shared location.
 *
 * 1. Creates ~/.dev-browser-skill/global-deps/ if it doesn't exist
 * 2. Copies package.json and package-lock.json from the skill directory
 * 3. Runs npm ci in the global directory
 * 4. Writes .lockfile-hash for version coherence checks
 */
export function installGlobalDeps(skillDir: string, config?: GlobalDepsConfig): void {
  const globalDir = getGlobalDepsDir(config);
  const localPackageJson = join(skillDir, "package.json");
  const localLockfile = join(skillDir, "package-lock.json");

  if (!existsSync(localPackageJson)) {
    throw new Error(`package.json not found at ${localPackageJson}`);
  }
  if (!existsSync(localLockfile)) {
    throw new Error(`package-lock.json not found at ${localLockfile}`);
  }

  // Create global deps directory
  mkdirSync(globalDir, { recursive: true });

  // Copy package.json and package-lock.json
  copyFileSync(localPackageJson, join(globalDir, "package.json"));
  copyFileSync(localLockfile, join(globalDir, "package-lock.json"));

  console.log(`Installing global dependencies to ${globalDir}...`);
  execSync("npm ci", { cwd: globalDir, stdio: "inherit" });

  // Write lockfile hash for version coherence checks
  const lockfileHash = computeFileHash(localLockfile);
  writeFileSync(join(globalDir, ".lockfile-hash"), lockfileHash, "utf-8");

  console.log(`Global dependencies installed successfully.`);
  console.log(`Lockfile hash: ${lockfileHash.slice(0, 12)}...`);
}

/**
 * Remove the global deps directory.
 */
export function cleanGlobalDeps(config?: GlobalDepsConfig): void {
  const globalDir = getGlobalDepsDir(config);
  if (existsSync(globalDir)) {
    rmSync(globalDir, { recursive: true, force: true });
    console.log(`Removed global dependencies at ${globalDir}`);
  } else {
    console.log(`No global dependencies found at ${globalDir}`);
  }
}

/**
 * Check if global deps exist and have a node_modules directory.
 */
export function hasGlobalDeps(config?: GlobalDepsConfig): boolean {
  const globalDir = getGlobalDepsDir(config);
  return existsSync(join(globalDir, "node_modules"));
}

/**
 * Check version coherence between local package-lock.json and global deps.
 * Returns null if coherent, or a warning message if mismatched.
 */
export function checkVersionCoherence(skillDir: string, config?: GlobalDepsConfig): string | null {
  const globalDir = getGlobalDepsDir(config);
  const localLockfile = join(skillDir, "package-lock.json");
  const globalHashFile = join(globalDir, ".lockfile-hash");

  if (!existsSync(localLockfile)) {
    return null; // No local lockfile to compare against
  }

  if (!existsSync(globalHashFile)) {
    return "Global deps missing version hash. Run: ./server.sh --install --global";
  }

  const localHash = computeFileHash(localLockfile);
  const globalHash = readFileSync(globalHashFile, "utf-8").trim();

  if (localHash !== globalHash) {
    return "Global deps out of date. Run: ./server.sh --install --global";
  }

  return null; // Coherent
}

/**
 * Get the NODE_PATH value for using global deps.
 */
export function getGlobalNodePath(config?: GlobalDepsConfig): string {
  const globalDir = getGlobalDepsDir(config);
  return join(globalDir, "node_modules");
}

/**
 * Determine whether to use global deps based on:
 * 1. DEV_BROWSER_GLOBAL_DEPS=true env var (forces global)
 * 2. Local node_modules exists → use local (backward compat)
 * 3. Global deps exist → use global
 * 4. Neither → return null (caller should auto-install locally)
 */
export function resolveDepSource(
  skillDir: string,
  config?: GlobalDepsConfig
): "local" | "global" | null {
  const forceGlobal = process.env.DEV_BROWSER_GLOBAL_DEPS === "true";
  const hasLocal = existsSync(join(skillDir, "node_modules"));
  const hasGlobal = hasGlobalDeps(config);

  if (forceGlobal) {
    if (hasGlobal) return "global";
    // Force global but no global deps installed
    console.warn(
      "Warning: DEV_BROWSER_GLOBAL_DEPS=true but no global deps found. Run: ./server.sh --install --global"
    );
    if (hasLocal) return "local";
    return null;
  }

  if (hasLocal) return "local";
  if (hasGlobal) return "global";
  return null;
}
