import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseArgs, resolveConfig, printHelp, type ParsedArgs } from "../cli.js";

/**
 * Tests for the CLI argument parser.
 *
 * The CLI parser is the foundation for all server configuration.
 * It enforces: CLI args > env vars > defaults, validates inputs,
 * and exits on unknown flags — preventing misconfiguration that
 * could silently start the server on wrong ports or modes.
 */

// Helper: create default ParsedArgs for resolveConfig tests
function defaultArgs(overrides: Partial<ParsedArgs> = {}): ParsedArgs {
  return {
    help: false,
    headless: false,
    headful: false,
    port: undefined,
    cdpPort: undefined,
    profileDir: undefined,
    label: undefined,
    cookies: [],
    status: false,
    stop: undefined,
    stopAll: false,
    installRequirements: false,
    global: false,
    clean: false,
    ...overrides,
  };
}

describe("parseArgs", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it("returns defaults for empty argv", () => {
    const result = parseArgs([]);
    expect(result).toEqual({
      help: false,
      headless: false,
      headful: false,
      port: undefined,
      cdpPort: undefined,
      profileDir: undefined,
      label: undefined,
      cookies: [],
      status: false,
      stop: undefined,
      stopAll: false,
      installRequirements: false,
      global: false,
      clean: false,
    });
  });

  it("parses --help flag", () => {
    const result = parseArgs(["--help"]);
    expect(result.help).toBe(true);
  });

  it("parses -h flag", () => {
    const result = parseArgs(["-h"]);
    expect(result.help).toBe(true);
  });

  it("parses --headless flag", () => {
    const result = parseArgs(["--headless"]);
    expect(result.headless).toBe(true);
    expect(result.headful).toBe(false);
  });

  it("parses --headful flag", () => {
    const result = parseArgs(["--headful"]);
    expect(result.headful).toBe(true);
    expect(result.headless).toBe(false);
  });

  it("parses --port with valid number", () => {
    const result = parseArgs(["--port", "8080"]);
    expect(result.port).toBe(8080);
  });

  it("exits on --port with invalid value", () => {
    expect(() => parseArgs(["--port", "abc"])).toThrow("process.exit called");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid port"));
  });

  it("exits on --port with out-of-range value", () => {
    expect(() => parseArgs(["--port", "99999"])).toThrow("process.exit called");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("exits on --port with no value", () => {
    expect(() => parseArgs(["--port"])).toThrow("process.exit called");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("requires a value"));
  });

  it("parses --cdp-port with valid number", () => {
    const result = parseArgs(["--cdp-port", "9224"]);
    expect(result.cdpPort).toBe(9224);
  });

  it("exits on --cdp-port with invalid value", () => {
    expect(() => parseArgs(["--cdp-port", "xyz"])).toThrow("process.exit called");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("parses --profile-dir", () => {
    const result = parseArgs(["--profile-dir", "/tmp/profiles"]);
    expect(result.profileDir).toBe("/tmp/profiles");
  });

  it("parses --label", () => {
    const result = parseArgs(["--label", "my-project"]);
    expect(result.label).toBe("my-project");
  });

  it("parses single --cookies flag", () => {
    const result = parseArgs(["--cookies", "name=session;value=abc;domain=.example.com"]);
    expect(result.cookies).toEqual(["name=session;value=abc;domain=.example.com"]);
  });

  it("parses multiple --cookies flags", () => {
    const result = parseArgs([
      "--cookies",
      "name=a;value=1;domain=.foo.com",
      "--cookies",
      '{"name":"b","value":"2","domain":".bar.com"}',
    ]);
    expect(result.cookies).toEqual([
      "name=a;value=1;domain=.foo.com",
      '{"name":"b","value":"2","domain":".bar.com"}',
    ]);
  });

  it("parses --status flag", () => {
    const result = parseArgs(["--status"]);
    expect(result.status).toBe(true);
  });

  it("parses --stop with port", () => {
    const result = parseArgs(["--stop", "9222"]);
    expect(result.stop).toBe("9222");
  });

  it("parses --stop-all flag", () => {
    const result = parseArgs(["--stop-all"]);
    expect(result.stopAll).toBe(true);
  });

  it("parses combined flags", () => {
    const result = parseArgs(["--headful", "--port", "8080", "--label", "test"]);
    expect(result.headful).toBe(true);
    expect(result.port).toBe(8080);
    expect(result.label).toBe("test");
  });

  it("exits on unknown flag with helpful message", () => {
    expect(() => parseArgs(["--unknown"])).toThrow("process.exit called");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown flag "--unknown"'));
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("--help"));
  });

  it("exits when value-flag is followed by another flag instead of value", () => {
    expect(() => parseArgs(["--port", "--headless"])).toThrow("process.exit called");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("requires a value"));
  });

  it("parses --install flag", () => {
    const result = parseArgs(["--install"]);
    expect(result.installRequirements).toBe(true);
  });

  it("parses --install-requirements flag (backward compat alias)", () => {
    const result = parseArgs(["--install-requirements"]);
    expect(result.installRequirements).toBe(true);
  });

  it("--install defaults to false", () => {
    const result = parseArgs([]);
    expect(result.installRequirements).toBe(false);
  });

  it("parses --global flag", () => {
    const result = parseArgs(["--install", "--global"]);
    expect(result.installRequirements).toBe(true);
    expect(result.global).toBe(true);
  });

  it("parses --clean flag", () => {
    const result = parseArgs(["--install", "--global", "--clean"]);
    expect(result.installRequirements).toBe(true);
    expect(result.global).toBe(true);
    expect(result.clean).toBe(true);
  });

  it("--global defaults to false", () => {
    const result = parseArgs([]);
    expect(result.global).toBe(false);
  });

  it("--clean defaults to false", () => {
    const result = parseArgs([]);
    expect(result.clean).toBe(false);
  });
});

describe("resolveConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Clear relevant env vars
    delete process.env.HEADLESS;
    delete process.env.PORT;
    delete process.env.DEV_BROWSER_DISABLE_HEADFUL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("uses defaults when no args or env vars", () => {
    const config = resolveConfig(defaultArgs());
    expect(config.headless).toBe(true);
    expect(config.port).toBe(9222);
    expect(config.cdpPort).toBe(9223);
    expect(config.profileDir).toBeUndefined();
    expect(config.label).toBeUndefined();
    expect(config.cookies).toEqual([]);
  });

  it("CLI --headful overrides default headless", () => {
    const config = resolveConfig(defaultArgs({ headful: true }));
    expect(config.headless).toBe(false);
  });

  it("CLI --headless explicitly sets headless", () => {
    const config = resolveConfig(defaultArgs({ headless: true }));
    expect(config.headless).toBe(true);
  });

  it("env HEADLESS=false makes headful", () => {
    process.env.HEADLESS = "false";
    const config = resolveConfig(defaultArgs());
    expect(config.headless).toBe(false);
  });

  it("env HEADLESS=true makes headless", () => {
    process.env.HEADLESS = "true";
    const config = resolveConfig(defaultArgs());
    expect(config.headless).toBe(true);
  });

  it("CLI --headful overrides env HEADLESS=true", () => {
    process.env.HEADLESS = "true";
    const config = resolveConfig(defaultArgs({ headful: true }));
    expect(config.headless).toBe(false);
  });

  it("CLI --headless overrides env HEADLESS=false", () => {
    process.env.HEADLESS = "false";
    const config = resolveConfig(defaultArgs({ headless: true }));
    expect(config.headless).toBe(true);
  });

  it("CLI --port overrides env PORT", () => {
    process.env.PORT = "9999";
    const config = resolveConfig(defaultArgs({ port: 8080 }));
    expect(config.port).toBe(8080);
  });

  it("env PORT is used when no CLI --port", () => {
    process.env.PORT = "8080";
    const config = resolveConfig(defaultArgs());
    expect(config.port).toBe(8080);
  });

  it("cdpPort defaults to port + 1", () => {
    const config = resolveConfig(defaultArgs({ port: 5000 }));
    expect(config.cdpPort).toBe(5001);
  });

  it("CLI --cdp-port overrides the default", () => {
    const config = resolveConfig(defaultArgs({ port: 5000, cdpPort: 6000 }));
    expect(config.cdpPort).toBe(6000);
  });

  it("passes through profileDir", () => {
    const config = resolveConfig(defaultArgs({ profileDir: "/tmp/test" }));
    expect(config.profileDir).toBe("/tmp/test");
  });

  it("passes through label", () => {
    const config = resolveConfig(defaultArgs({ label: "my-project" }));
    expect(config.label).toBe("my-project");
  });

  it("passes through cookies array", () => {
    const cookies = ["name=a;value=1;domain=.foo.com"];
    const config = resolveConfig(defaultArgs({ cookies }));
    expect(config.cookies).toEqual(cookies);
  });

  it("handles invalid env PORT gracefully (falls back to default)", () => {
    process.env.PORT = "not-a-number";
    const config = resolveConfig(defaultArgs());
    expect(config.port).toBe(9222);
  });

  it("DEV_BROWSER_DISABLE_HEADFUL=true forces headless even with --headful", () => {
    process.env.DEV_BROWSER_DISABLE_HEADFUL = "true";
    const config = resolveConfig(defaultArgs({ headful: true }));
    expect(config.headless).toBe(true);
  });

  it("DEV_BROWSER_DISABLE_HEADFUL=true forces headless without any flags", () => {
    process.env.DEV_BROWSER_DISABLE_HEADFUL = "true";
    const config = resolveConfig(defaultArgs());
    expect(config.headless).toBe(true);
  });

  it("DEV_BROWSER_DISABLE_HEADFUL=true overrides env HEADLESS=false", () => {
    process.env.DEV_BROWSER_DISABLE_HEADFUL = "true";
    process.env.HEADLESS = "false";
    const config = resolveConfig(defaultArgs());
    expect(config.headless).toBe(true);
  });

  it("DEV_BROWSER_DISABLE_HEADFUL not set allows --headful to work normally", () => {
    const config = resolveConfig(defaultArgs({ headful: true }));
    expect(config.headless).toBe(false);
  });

  it("DEV_BROWSER_DISABLE_HEADFUL=false does not override --headful", () => {
    process.env.DEV_BROWSER_DISABLE_HEADFUL = "false";
    const config = resolveConfig(defaultArgs({ headful: true }));
    expect(config.headless).toBe(false);
  });
});

describe("printHelp", () => {
  it("writes help text to stdout", () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    printHelp();
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining("dev-browser-skill"));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining("--help"));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining("--port"));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining("EXAMPLES"));
    stdoutSpy.mockRestore();
  });

  it("includes --install in help text", () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    printHelp();
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining("--install"));
    stdoutSpy.mockRestore();
  });

  it("includes ENVIRONMENT VARIABLES section in help text", () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    printHelp();
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining("ENVIRONMENT VARIABLES"));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining("DEV_BROWSER_DISABLE_HEADFUL"));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining("DEV_BROWSER_LOG_PATH"));
    stdoutSpy.mockRestore();
  });

  it("includes --global and global deps env vars in help text", () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    printHelp();
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining("--global"));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining("DEV_BROWSER_GLOBAL_DEPS"));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining("DEV_BROWSER_GLOBAL_DEPS_PATH"));
    stdoutSpy.mockRestore();
  });
});
