import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isPortAvailable, findAvailablePort } from "../port-selection.js";
import { createServer, type Server } from "net";

/**
 * Helper: occupy a port by starting a TCP server on it.
 * Returns a function to release the port.
 */
function occupyPort(port: number): Promise<{ server: Server; release: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      resolve({
        server,
        release: () =>
          new Promise<void>((res) => {
            server.close(() => res());
          }),
      });
    });
  });
}

describe("port-selection", () => {
  describe("isPortAvailable", () => {
    it("returns true for a port that is not in use", async () => {
      // Port 19300 is very unlikely to be in use during testing
      const available = await isPortAvailable(19300);
      expect(available).toBe(true);
    });

    it("returns false for a port that is in use", async () => {
      const { release } = await occupyPort(19301);
      try {
        const available = await isPortAvailable(19301);
        expect(available).toBe(false);
      } finally {
        await release();
      }
    });

    it("returns true again after a port is released", async () => {
      const { release } = await occupyPort(19302);
      expect(await isPortAvailable(19302)).toBe(false);
      await release();
      expect(await isPortAvailable(19302)).toBe(true);
    });
  });

  describe("findAvailablePort", () => {
    it("returns the requested port when it is free", async () => {
      const result = await findAvailablePort(19310);
      expect(result.port).toBe(19310);
      expect(result.cdpPort).toBe(19311);
      expect(result.wasAutoSelected).toBe(false);
      expect(result.requestedPort).toBe(19310);
    });

    it("auto-selects next port pair when requested port is occupied", async () => {
      // Occupy port 19320 (the HTTP port)
      const { release } = await occupyPort(19320);
      try {
        const result = await findAvailablePort(19320);
        expect(result.port).toBe(19322);
        expect(result.cdpPort).toBe(19323);
        expect(result.wasAutoSelected).toBe(true);
        expect(result.requestedPort).toBe(19320);
      } finally {
        await release();
      }
    });

    it("auto-selects next port pair when CDP port is occupied", async () => {
      // Occupy port 19331 (the CDP port for HTTP 19330)
      const { release } = await occupyPort(19331);
      try {
        const result = await findAvailablePort(19330);
        expect(result.port).toBe(19332);
        expect(result.cdpPort).toBe(19333);
        expect(result.wasAutoSelected).toBe(true);
        expect(result.requestedPort).toBe(19330);
      } finally {
        await release();
      }
    });

    it("skips multiple occupied ports", async () => {
      // Occupy 19340, 19342, 19343
      const servers = await Promise.all([occupyPort(19340), occupyPort(19342), occupyPort(19343)]);
      try {
        const result = await findAvailablePort(19340);
        // 19340 occupied → skip
        // 19342 occupied → skip
        // 19344+19345 should be free
        expect(result.port).toBe(19344);
        expect(result.cdpPort).toBe(19345);
        expect(result.wasAutoSelected).toBe(true);
      } finally {
        await Promise.all(servers.map((s) => s.release()));
      }
    });

    it("throws when explicit CDP port is set and HTTP port is occupied", async () => {
      const { release } = await occupyPort(19350);
      try {
        await expect(findAvailablePort(19350, 19351)).rejects.toThrow(
          "Port 19350 is already in use"
        );
      } finally {
        await release();
      }
    });

    it("throws when explicit CDP port is set and CDP port is occupied", async () => {
      const { release } = await occupyPort(19361);
      try {
        await expect(findAvailablePort(19360, 19361)).rejects.toThrow(
          "CDP port 19361 is already in use"
        );
      } finally {
        await release();
      }
    });

    it("returns requested pair when explicit CDP port is set and both are free", async () => {
      const result = await findAvailablePort(19370, 19375);
      expect(result.port).toBe(19370);
      expect(result.cdpPort).toBe(19375);
      expect(result.wasAutoSelected).toBe(false);
    });

    it("throws after maxAttempts exceeded", async () => {
      // Occupy a continuous range
      const servers = await Promise.all([occupyPort(19380), occupyPort(19382), occupyPort(19384)]);
      try {
        await expect(findAvailablePort(19380, undefined, 3)).rejects.toThrow(
          "Could not find an available port pair after 3 attempts"
        );
      } finally {
        await Promise.all(servers.map((s) => s.release()));
      }
    });
  });
});
