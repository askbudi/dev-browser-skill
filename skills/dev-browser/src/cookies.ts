/**
 * Cookie parsing module for dev-browser-skill.
 *
 * Supports three input formats:
 * - Key-value: name=session;value=abc;domain=.example.com
 * - JSON: single object or array of cookie objects
 * - File reference: @cookies.json or @cookies.txt (Netscape format)
 *
 * Domain is REQUIRED for key-value and JSON formats.
 * Multiple --cookies flags merge; duplicate name+domain → last wins.
 */

import { readFileSync, existsSync } from "fs";
import { resolve, extname } from "path";

export interface CookieParam {
  name: string;
  value: string;
  domain: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

export class CookieParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CookieParseError";
  }
}

/**
 * Parse a key-value cookie string.
 * Format: name=session;value=abc;domain=.example.com;path=/;secure;httpOnly
 */
export function parseKeyValueCookie(input: string): CookieParam {
  const fields = new Map<string, string>();

  for (const part of input.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) {
      // Boolean flag (secure, httpOnly)
      fields.set(trimmed.toLowerCase(), "true");
    } else {
      const key = trimmed.slice(0, eqIndex).trim().toLowerCase();
      const val = trimmed.slice(eqIndex + 1).trim();
      fields.set(key, val);
    }
  }

  const name = fields.get("name");
  const value = fields.get("value");
  const domain = fields.get("domain");

  if (!name) {
    throw new CookieParseError(
      `Cookie key-value string missing 'name' field. Got: "${input}"\n` +
        `Expected format: name=session;value=abc;domain=.example.com`
    );
  }

  if (value === undefined) {
    throw new CookieParseError(
      `Cookie '${name}' missing 'value' field.\n` +
        `Expected format: name=session;value=abc;domain=.example.com`
    );
  }

  if (!domain) {
    throw new CookieParseError(`Cookie '${name}' requires a domain. Use domain=.example.com`);
  }

  const cookie: CookieParam = { name, value, domain };

  const path = fields.get("path");
  if (path) cookie.path = path;

  const expires = fields.get("expires");
  if (expires) {
    const num = Number(expires);
    if (isNaN(num)) {
      throw new CookieParseError(
        `Cookie '${name}' has invalid expires value '${expires}'. Must be a Unix timestamp.`
      );
    }
    cookie.expires = num;
  }

  if (fields.get("httponly") === "true" || fields.get("httponly") === "true") {
    cookie.httpOnly = true;
  }
  if (fields.get("secure") === "true") {
    cookie.secure = true;
  }

  const sameSite = fields.get("samesite");
  if (sameSite) {
    const normalized = sameSite.charAt(0).toUpperCase() + sameSite.slice(1).toLowerCase();
    if (normalized !== "Strict" && normalized !== "Lax" && normalized !== "None") {
      throw new CookieParseError(
        `Cookie '${name}' has invalid sameSite value '${sameSite}'. Must be Strict, Lax, or None.`
      );
    }
    cookie.sameSite = normalized as "Strict" | "Lax" | "None";
  }

  return cookie;
}

/**
 * Parse JSON cookie input — single object or array.
 */
export function parseJsonCookies(input: string): CookieParam[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new CookieParseError(
      `Invalid JSON cookie format: ${input.length > 100 ? input.slice(0, 100) + "..." : input}\n` +
        `Expected: {"name":"x","value":"y","domain":".example.com"} or [{...}, {...}]`
    );
  }

  const items = Array.isArray(parsed) ? parsed : [parsed];

  if (items.length === 0) {
    throw new CookieParseError("JSON cookie array is empty.");
  }

  return items.map((item, index) => validateJsonCookie(item, index));
}

function validateJsonCookie(item: unknown, index: number): CookieParam {
  if (typeof item !== "object" || item === null) {
    throw new CookieParseError(`Cookie at index ${index} is not an object. Got: ${typeof item}`);
  }

  const obj = item as Record<string, unknown>;
  const { name, value, domain } = obj;

  if (typeof name !== "string" || !name) {
    throw new CookieParseError(
      `Cookie at index ${index} missing or invalid 'name'. Must be a non-empty string.`
    );
  }

  if (typeof value !== "string") {
    throw new CookieParseError(
      `Cookie '${name}' (index ${index}) missing or invalid 'value'. Must be a string.`
    );
  }

  if (typeof domain !== "string" || !domain) {
    throw new CookieParseError(`Cookie '${name}' requires a domain. Use domain=.example.com`);
  }

  const cookie: CookieParam = { name, value, domain };

  if (obj.path !== undefined) {
    if (typeof obj.path !== "string") {
      throw new CookieParseError(`Cookie '${name}' has invalid 'path'. Must be a string.`);
    }
    cookie.path = obj.path;
  }

  if (obj.expires !== undefined) {
    if (typeof obj.expires !== "number") {
      throw new CookieParseError(
        `Cookie '${name}' has invalid 'expires'. Must be a number (Unix timestamp).`
      );
    }
    cookie.expires = obj.expires;
  }

  if (obj.httpOnly !== undefined) {
    if (typeof obj.httpOnly !== "boolean") {
      throw new CookieParseError(`Cookie '${name}' has invalid 'httpOnly'. Must be a boolean.`);
    }
    cookie.httpOnly = obj.httpOnly;
  }

  if (obj.secure !== undefined) {
    if (typeof obj.secure !== "boolean") {
      throw new CookieParseError(`Cookie '${name}' has invalid 'secure'. Must be a boolean.`);
    }
    cookie.secure = obj.secure;
  }

  if (obj.sameSite !== undefined) {
    if (typeof obj.sameSite !== "string" || !["Strict", "Lax", "None"].includes(obj.sameSite)) {
      throw new CookieParseError(
        `Cookie '${name}' has invalid 'sameSite'. Must be "Strict", "Lax", or "None".`
      );
    }
    cookie.sameSite = obj.sameSite as "Strict" | "Lax" | "None";
  }

  return cookie;
}

/**
 * Parse a Netscape/cURL cookie text file.
 * Format: domain\tincludeSubdomains\tpath\tsecure\texpires\tname\tvalue
 * Lines starting with # are comments. Empty lines are skipped.
 */
export function parseNetscapeCookies(content: string): CookieParam[] {
  const cookies: CookieParam[] = [];

  for (const rawLine of content.split("\n")) {
    // Trim spaces and carriage returns but preserve tabs (they are field separators)
    const line = rawLine.replace(/^[ \r]+|[ \r]+$/g, "");

    // Skip empty lines and comments
    if (!line || line.startsWith("#")) continue;

    const fields = line.split("\t");
    if (fields.length < 7) {
      throw new CookieParseError(
        `Invalid Netscape cookie line (expected 7 tab-separated fields, got ${fields.length}): "${line}"`
      );
    }

    const [domain, , path, secure, expires, name, value] = fields;

    if (!domain || !name || value === undefined) {
      throw new CookieParseError(
        `Invalid Netscape cookie line (missing required fields): "${line}"`
      );
    }

    const cookie: CookieParam = {
      name,
      value,
      domain,
      path: path || "/",
    };

    if (secure?.toUpperCase() === "TRUE") {
      cookie.secure = true;
    }

    const expiresNum = Number(expires);
    if (!isNaN(expiresNum) && expiresNum > 0) {
      cookie.expires = expiresNum;
    }

    cookies.push(cookie);
  }

  if (cookies.length === 0) {
    throw new CookieParseError("Netscape cookie file contains no cookie entries.");
  }

  return cookies;
}

/**
 * Load cookies from a file reference (path starting with @).
 * Auto-detects format based on file extension:
 * - .json → JSON format
 * - .txt or no extension → try Netscape, fallback to JSON
 */
export function loadCookiesFromFile(filePath: string): CookieParam[] {
  const resolvedPath = resolve(filePath);

  if (!existsSync(resolvedPath)) {
    throw new CookieParseError(`Cookie file not found: ${resolvedPath}`);
  }

  const content = readFileSync(resolvedPath, "utf-8");
  const ext = extname(resolvedPath).toLowerCase();

  if (ext === ".json") {
    return parseJsonCookies(content);
  }

  // For .txt or unknown extensions, try Netscape first, then JSON
  try {
    return parseNetscapeCookies(content);
  } catch {
    // Netscape parsing failed, try JSON
    try {
      return parseJsonCookies(content);
    } catch {
      throw new CookieParseError(
        `Could not parse cookie file '${resolvedPath}' as Netscape or JSON format.\n` +
          `Netscape format: domain\\tsubdomains\\tpath\\tsecure\\texpires\\tname\\tvalue\n` +
          `JSON format: {"name":"x","value":"y","domain":".example.com"} or [{...}]`
      );
    }
  }
}

/**
 * Parse a single --cookies argument value.
 * Detects format automatically:
 * - Starts with @ → file reference
 * - Starts with { or [ → JSON
 * - Otherwise → key-value
 */
export function parseCookieArg(arg: string): CookieParam[] {
  if (arg.startsWith("@")) {
    return loadCookiesFromFile(arg.slice(1));
  }

  const trimmed = arg.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return parseJsonCookies(trimmed);
  }

  return [parseKeyValueCookie(trimmed)];
}

/**
 * Parse all --cookies arguments, merge results.
 * Duplicate name+domain → last wins.
 */
export function parseAllCookies(cookieArgs: string[]): CookieParam[] {
  const cookieMap = new Map<string, CookieParam>();

  for (const arg of cookieArgs) {
    const parsed = parseCookieArg(arg);
    for (const cookie of parsed) {
      const key = `${cookie.name}::${cookie.domain}`;
      cookieMap.set(key, cookie);
    }
  }

  return Array.from(cookieMap.values());
}

/**
 * Generate a log-safe summary of loaded cookies.
 * Shows names and domains only (never values).
 */
export function cookieSummary(cookies: CookieParam[]): string {
  if (cookies.length === 0) return "No cookies loaded.";

  const domains = new Set(cookies.map((c) => c.domain));
  const lines = [
    `Loaded ${cookies.length} cookie${cookies.length === 1 ? "" : "s"} for ${domains.size} domain${domains.size === 1 ? "" : "s"}`,
  ];

  for (const cookie of cookies) {
    lines.push(`  - ${cookie.name} (${cookie.domain})`);
  }

  return lines.join("\n");
}
