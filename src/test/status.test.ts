// Tests for runtime status tracking and log eviction.
import { describe, expect, it } from "bun:test";
import { createRuntimeStatus, type StatusEvent } from "../status";

describe("runtime status", () => {
  it("tracks session state and keeps only recent events", () => {
    const status = createRuntimeStatus(2);

    status.setSessionState("checking");
    status.record("info", "first");
    status.record("info", "second");
    status.record("error", "third");

    const snapshot = status.snapshot();
    expect(snapshot.sessionState).toBe("checking");
    expect(snapshot.events.map((event: StatusEvent) => event.message)).toEqual([
      "second",
      "third",
    ]);
    expect(snapshot.lastError).toBe("third");
  });

  it("records a successful login", () => {
    const status = createRuntimeStatus();
    status.markLogin();

    const snapshot = status.snapshot();
    expect(snapshot.sessionState).toBe("authenticated");
    expect(snapshot.lastLoginAt).not.toBeNull();
  });

  it("initializes and updates feature health status", () => {
    const status = createRuntimeStatus();
    const initial = status.snapshot();
    expect(initial.features.search).toBeDefined();
    expect(initial.features.search.status).toBe("pending");

    status.setFeatureStatus("search", {
      status: "operational",
      latencyMs: 145,
      lastCheckedAt: "2026-09-08T00:00:00.000Z",
      details: "15 items found",
    });

    const updated = status.snapshot();
    expect(updated.features.search.status).toBe("operational");
    expect(updated.features.search.latencyMs).toBe(145);
    expect(updated.features.search.details).toBe("15 items found");
  });
});
