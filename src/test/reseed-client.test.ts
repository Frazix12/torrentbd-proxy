import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

process.env.TBD_USERNAME ??= "test-user";
process.env.TBD_PASSWORD ??= "test-password";
process.env.TBD_TOTP_SECRET ??= "JBSWY3DPEHPK3PXP";
process.env.PROXY_API_KEY ??= "test-key";
process.env.TBD_BASE_URL = "https://www.torrentbd.net";

const getSessionHeaders = mock(async () => ({ Cookie: "sid=test" }));
const invalidateSession = mock(() => {});

const actualSession = await import("../session");

mock.module("../session", () => ({
  ...actualSession,
  getSessionHeaders,
  invalidateSession,
}));

const { fetchReseedPage } = await import("../tbd-client");
const originalFetch = globalThis.fetch;

function upstreamResponse(body: string, url: string, status = 200): Response {
  const response = new Response(body, { status });
  Object.defineProperty(response, "url", { value: url });
  return response;
}

beforeEach(() => {
  getSessionHeaders.mockClear();
  invalidateSession.mockClear();
});

afterAll(() => {
  globalThis.fetch = originalFetch;
  mock.restore();
});

describe("fetchReseedPage", () => {
  it("fetches an authenticated reseed page", async () => {
    const fetchStub = mock(async () =>
      upstreamResponse(
        "<table>requests</table>",
        "https://www.torrentbd.net/reseed-requests.php?page=2",
      ),
    );
    globalThis.fetch = fetchStub as unknown as typeof fetch;

    const html = await fetchReseedPage(
      "https://www.torrentbd.net/reseed-requests.php?page=2",
    );

    expect(html).toBe("<table>requests</table>");
    expect(fetchStub).toHaveBeenCalledWith(
      "https://www.torrentbd.net/reseed-requests.php?page=2",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Cookie: "sid=test" }),
        redirect: "follow",
      }),
    );
  });

  it("invalidates and retries once after a login redirect", async () => {
    const fetchStub = mock()
      .mockResolvedValueOnce(
        upstreamResponse(
          '<form action="takelogin.php"></form>',
          "https://www.torrentbd.net/account-login.php",
        ),
      )
      .mockResolvedValueOnce(
        upstreamResponse(
          "<table>requests</table>",
          "https://www.torrentbd.net/reseed-requests.php",
        ),
      );
    globalThis.fetch = fetchStub as unknown as typeof fetch;

    expect(await fetchReseedPage()).toBe("<table>requests</table>");
    expect(fetchStub).toHaveBeenCalledTimes(2);
    expect(getSessionHeaders).toHaveBeenCalledTimes(2);
    expect(invalidateSession).toHaveBeenCalledTimes(1);
  });

  it("rejects a cross-origin URL before fetching", async () => {
    const fetchStub = mock(async () =>
      upstreamResponse("not reached", "https://evil.example"),
    );
    globalThis.fetch = fetchStub as unknown as typeof fetch;

    await expect(
      fetchReseedPage("https://evil.example/reseed-requests.php"),
    ).rejects.toThrow("Invalid reseed page URL");
    expect(fetchStub).not.toHaveBeenCalled();
    expect(getSessionHeaders).not.toHaveBeenCalled();
  });
});
