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
});
