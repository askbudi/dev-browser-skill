import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Tests for serve() default behavior.
 *
 * The serve() function is the entry point for Launch mode. Its defaults
 * determine the out-of-box experience for AI agents and CI/CD. Getting
 * headless mode wrong means either invisible browsers when users expect
 * to see them, or visible windows flooding CI runners.
 */

// Mock Playwright so we don't launch a real browser
const mockPage = {
  on: vi.fn(),
  close: vi.fn(),
  setViewportSize: vi.fn(),
};

const mockCDPSession = {
  send: vi.fn().mockResolvedValue({
    targetInfo: { targetId: "mock-target-id" },
  }),
  detach: vi.fn(),
};

const mockContext = {
  newPage: vi.fn().mockResolvedValue(mockPage),
  newCDPSession: vi.fn().mockResolvedValue(mockCDPSession),
  close: vi.fn(),
};

const mockLaunchPersistentContext = vi.fn().mockResolvedValue(mockContext);

vi.mock("playwright", () => ({
  chromium: {
    launchPersistentContext: (...args: unknown[]) => mockLaunchPersistentContext(...args),
  },
}));

// Mock express
const mockListen = vi.fn((_port: number, cb: () => void) => {
  cb();
  return {
    on: vi.fn(),
    close: vi.fn(),
  };
});

vi.mock("express", () => {
  const app = {
    use: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    listen: (...args: unknown[]) => mockListen(...(args as [number, () => void])),
  };
  const expressFn = () => app;
  expressFn.json = vi.fn();
  return { default: expressFn };
});

// Mock fetch for CDP endpoint discovery
vi.stubGlobal(
  "fetch",
  vi.fn().mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        webSocketDebuggerUrl: "ws://127.0.0.1:9223/devtools/browser/mock",
      }),
  })
);

// Mock fs.mkdirSync to avoid creating real directories
vi.mock("fs", () => ({
  mkdirSync: vi.fn(),
}));

describe("serve() defaults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up any process listeners added by serve()
  });

  it("defaults to headless=true when no options provided", async () => {
    const { serve } = await import("../index.js");
    const server = await serve({ port: 19222, cdpPort: 19223 });

    expect(mockLaunchPersistentContext).toHaveBeenCalledTimes(1);
    const [, options] = mockLaunchPersistentContext.mock.calls[0]!;
    expect(options.headless).toBe(true);

    await server.stop();
  });

  it("respects headless=false when explicitly set", async () => {
    const { serve } = await import("../index.js");
    const server = await serve({ port: 19224, cdpPort: 19225, headless: false });

    expect(mockLaunchPersistentContext).toHaveBeenCalledTimes(1);
    const [, options] = mockLaunchPersistentContext.mock.calls[0]!;
    expect(options.headless).toBe(false);

    await server.stop();
  });

  it("respects headless=true when explicitly set", async () => {
    const { serve } = await import("../index.js");
    const server = await serve({ port: 19226, cdpPort: 19227, headless: true });

    expect(mockLaunchPersistentContext).toHaveBeenCalledTimes(1);
    const [, options] = mockLaunchPersistentContext.mock.calls[0]!;
    expect(options.headless).toBe(true);

    await server.stop();
  });
});
