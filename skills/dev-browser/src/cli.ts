/**
 * CLI argument parser for dev-browser-skill server.
 *
 * Supports flags for both launch mode and future extension mode.
 * Priority order: CLI args > env vars > defaults.
 */

export interface ParsedArgs {
  help: boolean;
  headless: boolean;
  headful: boolean;
  port: number | undefined;
  cdpPort: number | undefined;
  profileDir: string | undefined;
  label: string | undefined;
  cookies: string[];
  status: boolean;
  stop: string | undefined;
  stopAll: boolean;
  installRequirements: boolean;
}

export interface ResolvedConfig {
  headless: boolean;
  port: number;
  cdpPort: number;
  profileDir: string | undefined;
  label: string | undefined;
  cookies: string[];
}

const HELP_TEXT = `dev-browser-skill — Browser automation server for AI agents

USAGE:
  ./server.sh [OPTIONS]
  npx tsx scripts/start-server.ts [OPTIONS]

OPTIONS:
  -h, --help              Show this help message and exit
  --headless              Run browser in headless mode (default)
  --headful               Run browser in headful mode (visible window)
  --port <number>         HTTP API port (default: 9222)
  --cdp-port <number>     Chrome DevTools Protocol port (default: 9223)
  --profile-dir <path>    Browser profile directory (default: ./profiles)
  --label <name>          Label this server instance (default: $PWD)
  --cookies <source>      Load cookies (repeatable; see COOKIES below)
  --status                Show running server instances and exit
  --stop <port>           Stop the server instance on the given port
  --stop-all              Stop all running server instances
  --install-requirements  Install Playwright browsers and exit (no server start)

ENVIRONMENT VARIABLES:
  DEV_BROWSER_DISABLE_HEADFUL=true   Force headless mode (ignores --headful flag)
  DEV_BROWSER_LOG_PATH=<path>        Redirect all log output to the specified file
  PORT=<number>                      HTTP API port (overridden by --port flag)
  HEADLESS=true|false                Browser mode (overridden by --headful/--headless flags)

COOKIES:
  --cookies @cookies.json                                      Load from JSON file
  --cookies @cookies.txt                                       Load from Netscape cookie file
  --cookies '{"name":"a","value":"b","domain":".example.com"}' JSON format
  --cookies 'name=session;value=abc;domain=.example.com'       Key-value format

EXAMPLES:
  ./server.sh                          Start headless browser on port 9222
  ./server.sh --headful --port 8080    Start visible browser on port 8080
  ./server.sh --status                 List all running server instances
  ./server.sh --stop 9222              Stop server on port 9222
  ./server.sh --install-requirements  Install Playwright browsers only
`;

const KNOWN_FLAGS = new Set([
  "--help",
  "-h",
  "--headless",
  "--headful",
  "--port",
  "--cdp-port",
  "--profile-dir",
  "--label",
  "--cookies",
  "--status",
  "--stop",
  "--stop-all",
  "--install-requirements",
]);

const FLAGS_WITH_VALUES = new Set([
  "--port",
  "--cdp-port",
  "--profile-dir",
  "--label",
  "--cookies",
  "--stop",
]);

export function printHelp(): void {
  process.stdout.write(HELP_TEXT);
}

export function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
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
  };

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i]!;

    if (!KNOWN_FLAGS.has(arg)) {
      process.stderr.write(`Error: Unknown flag "${arg}"\n`);
      process.stderr.write(`Run with --help to see available options.\n`);
      process.exit(1);
    }

    if (FLAGS_WITH_VALUES.has(arg)) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        process.stderr.write(`Error: Flag "${arg}" requires a value.\n`);
        process.stderr.write(`Run with --help to see available options.\n`);
        process.exit(1);
      }
    }

    switch (arg) {
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--headless":
        args.headless = true;
        break;
      case "--headful":
        args.headful = true;
        break;
      case "--port": {
        const val = argv[++i]!;
        const num = parseInt(val, 10);
        if (isNaN(num) || num < 1 || num > 65535) {
          process.stderr.write(
            `Error: Invalid port "${val}". Must be a number between 1 and 65535.\n`
          );
          process.exit(1);
        }
        args.port = num;
        break;
      }
      case "--cdp-port": {
        const val = argv[++i]!;
        const num = parseInt(val, 10);
        if (isNaN(num) || num < 1 || num > 65535) {
          process.stderr.write(
            `Error: Invalid CDP port "${val}". Must be a number between 1 and 65535.\n`
          );
          process.exit(1);
        }
        args.cdpPort = num;
        break;
      }
      case "--profile-dir":
        args.profileDir = argv[++i]!;
        break;
      case "--label":
        args.label = argv[++i]!;
        break;
      case "--cookies":
        args.cookies.push(argv[++i]!);
        break;
      case "--status":
        args.status = true;
        break;
      case "--stop":
        args.stop = argv[++i]!;
        break;
      case "--stop-all":
        args.stopAll = true;
        break;
      case "--install-requirements":
        args.installRequirements = true;
        break;
    }

    i++;
  }

  return args;
}

/**
 * Resolve final configuration by merging CLI args, env vars, and defaults.
 * Priority: CLI args > env vars > defaults.
 */
export function resolveConfig(args: ParsedArgs): ResolvedConfig {
  // Headless resolution:
  // DEV_BROWSER_DISABLE_HEADFUL=true overrides everything (forces headless)
  // Otherwise: CLI --headful/--headless > env HEADLESS > default (true)
  const disableHeadful = process.env.DEV_BROWSER_DISABLE_HEADFUL === "true";

  let headless: boolean;
  if (disableHeadful) {
    headless = true;
  } else if (args.headful) {
    headless = false;
  } else if (args.headless) {
    headless = true;
  } else if (process.env.HEADLESS !== undefined) {
    headless = process.env.HEADLESS !== "false";
  } else {
    headless = true; // new default: headless
  }

  // Port resolution: CLI --port > env PORT > default 9222
  let port: number;
  if (args.port !== undefined) {
    port = args.port;
  } else if (process.env.PORT !== undefined) {
    const envPort = parseInt(process.env.PORT, 10);
    port = isNaN(envPort) ? 9222 : envPort;
  } else {
    port = 9222;
  }

  // CDP port resolution: CLI --cdp-port > default (port + 1)
  const cdpPort = args.cdpPort ?? port + 1;

  return {
    headless,
    port,
    cdpPort,
    profileDir: args.profileDir,
    label: args.label,
    cookies: args.cookies,
  };
}
