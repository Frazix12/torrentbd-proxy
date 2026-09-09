// src/test/dashboard.test.ts
import { describe, expect, it } from "bun:test";
import { renderDashboard } from "../dashboard";
import server from "../index";

describe("dashboard", () => {
  it("renders the status view and polls the status endpoint", () => {
    const html = renderDashboard();

    expect(html).toContain("TorrentBD Proxy");
    expect(html).toContain('fetch("/status")');
    expect(html).toContain("Recent events");
    expect(html).toContain("Feature Health");
    expect(html).toContain("Run Tests Now");
  });

  it("serves HTML at / and JSON at /status without external services", async () => {
    const resRoot = await server.fetch(new Request("http://localhost/"));
    expect(resRoot.status).toBe(200);
    expect(resRoot.headers.get("content-type")).toContain("text/html");

    const resStatus = await server.fetch(
      new Request("http://localhost/status"),
    );
    expect(resStatus.status).toBe(200);
    const json = (await resStatus.json()) as {
      uptimeSeconds: number;
      sessionState: string;
      events: unknown[];
      features: Record<string, unknown>;
    };
    expect(typeof json.uptimeSeconds).toBe("number");
    expect(typeof json.sessionState).toBe("string");
    expect(Array.isArray(json.events)).toBe(true);
    expect(json.features).toBeDefined();
    expect(json.features.session).toBeDefined();
  });
});
