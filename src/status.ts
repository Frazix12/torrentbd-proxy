// src/status.ts
// Bounded in-memory runtime status and event buffer for the LAN dashboard.

export type StatusLevel = "info" | "error" | "warn";
export type FeatureState = "operational" | "degraded" | "failing" | "pending";

export interface FeatureStatus {
  id: string;
  name: string;
  status: FeatureState;
  latencyMs: number;
  lastCheckedAt: string | null;
  details?: string | null;
}

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
  features: Record<string, FeatureStatus>;
}

export function createRuntimeStatus(maxEvents = 50) {
  const startedAt = Date.now();
  let sessionState = "idle";
  let lastLoginAt: string | null = null;
  let lastError: string | null = null;
  const events: StatusEvent[] = [];
  const features: Record<string, FeatureStatus> = {
    session: {
      id: "session",
      name: "TorrentBD Session",
      status: "pending",
      latencyMs: 0,
      lastCheckedAt: null,
      details: "Not checked yet",
    },
    caps: {
      id: "caps",
      name: "Torznab Caps",
      status: "pending",
      latencyMs: 0,
      lastCheckedAt: null,
      details: "Not checked yet",
    },
    browse: {
      id: "browse",
      name: "Browse Feed",
      status: "pending",
      latencyMs: 0,
      lastCheckedAt: null,
      details: "Not checked yet",
    },
    search: {
      id: "search",
      name: "Torrent Search",
      status: "pending",
      latencyMs: 0,
      lastCheckedAt: null,
      details: "Not checked yet",
    },
    download: {
      id: "download",
      name: "Download Connectivity",
      status: "pending",
      latencyMs: 0,
      lastCheckedAt: null,
      details: "Not checked yet",
    },
  };

  return {
    setSessionState(state: string) {
      sessionState = state;
    },
    markLogin() {
      sessionState = "authenticated";
      lastLoginAt = new Date().toISOString();
    },
    setFeatureStatus(id: string, update: Partial<FeatureStatus>) {
      if (!features[id]) {
        features[id] = {
          id,
          name: id,
          status: "pending",
          latencyMs: 0,
          lastCheckedAt: null,
        };
      }
      features[id] = { ...features[id], ...update };
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
        features: { ...features },
      };
    },
  };
}

export const runtimeStatus = createRuntimeStatus();
