// src/status.ts
// Bounded in-memory runtime status and event buffer for the LAN dashboard.

export type StatusLevel = "info" | "error" | "warn";

export interface StatusEvent {
  timestamp: string;
  level: StatusLevel;
  message: string;
}

export interface StatusSnapshot {
  uptimeSeconds: number;
  sessionState: string;
  lastLoginAt: string | null;
  lastError: string | null;
  events: StatusEvent[];
}

export function createRuntimeStatus(maxEvents = 50) {
  const startedAt = Date.now();
  let sessionState = "idle";
  let lastLoginAt: string | null = null;
  let lastError: string | null = null;
  const events: StatusEvent[] = [];

  return {
    setSessionState(state: string) {
      sessionState = state;
    },
    markLogin() {
      sessionState = "authenticated";
      lastLoginAt = new Date().toISOString();
    },
    record(level: StatusLevel, message: string) {
      if (level === "error") {
        lastError = message;
      }
      events.push({
        timestamp: new Date().toISOString(),
        level,
        message,
      });
      if (events.length > maxEvents) {
        events.shift();
      }
    },
    snapshot(): StatusSnapshot {
      return {
        uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
        sessionState,
        lastLoginAt,
        lastError,
        events: [...events],
      };
    },
  };
}

export const runtimeStatus = createRuntimeStatus();
