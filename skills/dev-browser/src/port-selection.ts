/**
 * Port auto-selection for multi-instance support.
 *
 * When the default port (9222) is occupied, tries 9224, 9226, 9228...
 * incrementing by 2 to leave room for the CDP port (HTTP port + 1).
 */

import { createServer, type Server } from "net";

/**
 * Check if a TCP port is available by briefly binding to it.
 * Returns true if the port is free, false if in use.
 */
export function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server: Server = createServer();
    server.once("error", () => {
      resolve(false);
    });
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

export interface PortSelectionResult {
  port: number;
  cdpPort: number;
  /** True if the selected port differs from the requested port. */
  wasAutoSelected: boolean;
  /** The originally-requested port (for logging). */
  requestedPort: number;
}

/**
 * Find an available port pair (HTTP + CDP).
 *
 * @param requestedPort - The preferred HTTP port (default 9222).
 * @param requestedCdpPort - If explicitly set, only that pair is tried (no auto-selection).
 * @param maxAttempts - How many port pairs to try before giving up.
 */
export async function findAvailablePort(
  requestedPort: number = 9222,
  requestedCdpPort?: number,
  maxAttempts: number = 20
): Promise<PortSelectionResult> {
  // If user explicitly set a CDP port, don't auto-select — just check the exact pair
  if (requestedCdpPort !== undefined) {
    const httpFree = await isPortAvailable(requestedPort);
    const cdpFree = await isPortAvailable(requestedCdpPort);

    if (!httpFree) {
      throw new Error(`Port ${requestedPort} is already in use. Specify a different --port.`);
    }
    if (!cdpFree) {
      throw new Error(
        `CDP port ${requestedCdpPort} is already in use. Specify a different --cdp-port.`
      );
    }

    return {
      port: requestedPort,
      cdpPort: requestedCdpPort,
      wasAutoSelected: false,
      requestedPort,
    };
  }

  // Auto-selection: try requestedPort, then requestedPort+2, +4, ...
  let candidate = requestedPort;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const cdpCandidate = candidate + 1;

    // Ensure both ports are in valid range
    if (candidate > 65535 || cdpCandidate > 65535) {
      break;
    }

    const httpFree = await isPortAvailable(candidate);
    const cdpFree = await isPortAvailable(cdpCandidate);

    if (httpFree && cdpFree) {
      return {
        port: candidate,
        cdpPort: cdpCandidate,
        wasAutoSelected: candidate !== requestedPort,
        requestedPort,
      };
    }

    candidate += 2;
  }

  throw new Error(
    `Could not find an available port pair after ${maxAttempts} attempts ` +
      `(tried ${requestedPort}–${candidate - 2}). Specify an explicit --port.`
  );
}
